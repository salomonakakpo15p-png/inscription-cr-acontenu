import { promises as fs } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertParticipant,
  InsertUser,
  Participant,
  User,
  participants,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { LOCAL_DATA_DIR } from "./_core/paths";
import { blobReadText, blobWriteText, isBlobEnabled, isPreconditionFailed } from "./blob";

let _db: ReturnType<typeof drizzle> | null = null;
let _warned = false;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Fallbacks used when DATABASE_URL is not configured: Vercel Blob when a store
// is connected (persistent, shared by every instance), local files otherwise.
const DATA_DIR = LOCAL_DATA_DIR;
const PARTICIPANTS_FILE = "participants.json";
const USERS_FILE = "users.json";

type Serialized<T> = Omit<T, "createdAt"> & { createdAt: string | Date };

function warnFallback() {
  if (_warned) return;
  _warned = true;
  if (isBlobEnabled()) {
    console.warn("[Database] DATABASE_URL is not set — storing data in Vercel Blob");
  } else if (process.env.VERCEL) {
    console.warn(
      "[Database] Neither DATABASE_URL nor a Blob store is configured: registrations are kept in /tmp and will be lost.",
    );
  } else {
    console.warn(
      `[Database] DATABASE_URL is not set — using local file storage in ${DATA_DIR}`,
    );
  }
}

async function readRows<T>(
  name: string,
  revive: (row: Serialized<T>) => T,
): Promise<{ rows: T[]; etag?: string }> {
  if (isBlobEnabled()) {
    const read = await blobReadText(name);
    if (!read) return { rows: [] };
    try {
      const parsed = JSON.parse(read.text);
      return { rows: Array.isArray(parsed) ? parsed.map(revive) : [], etag: read.etag };
    } catch {
      return { rows: [], etag: read.etag };
    }
  }

  try {
    const raw = await fs.readFile(path.join(DATA_DIR, name), "utf8");
    const parsed = JSON.parse(raw);
    return { rows: Array.isArray(parsed) ? parsed.map(revive) : [] };
  } catch {
    return { rows: [] };
  }
}

async function writeRows(name: string, rows: unknown[], etag?: string): Promise<void> {
  const json = JSON.stringify(rows, null, 2);

  if (isBlobEnabled()) {
    await blobWriteText(name, json, etag);
    return;
  }

  const file = path.join(DATA_DIR, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, file);
}

// Serialises read-modify-write cycles per file inside this process; the ETag
// check on Blob protects against writers running in another instance.
const chains = new Map<string, Promise<unknown>>();

function serialize<T>(name: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(name) ?? Promise.resolve();
  const run = previous.then(task, task);
  chains.set(
    name,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function updateRows<T>(
  name: string,
  revive: (row: Serialized<T>) => T,
  mutate: (rows: T[]) => void | Promise<void>,
): Promise<void> {
  await serialize(name, async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { rows, etag } = await readRows<T>(name, revive);
      await mutate(rows);
      try {
        await writeRows(name, rows, etag);
        return;
      } catch (error) {
        lastError = error;
        if (!isPreconditionFailed(error)) throw error;
        // Another instance won the race: back off, then re-read its rows.
        await new Promise(resolve => setTimeout(resolve, 40 * (attempt + 1)));
      }
    }
    throw lastError;
  });
}

function reviveParticipant(row: Serialized<Participant>): Participant {
  return { ...row, createdAt: new Date(row.createdAt), photoUrl: row.photoUrl ?? null };
}

function reviveUser(row: Serialized<User>): User {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt), lastSignedIn: new Date(row.lastSignedIn) };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();

  if (!db) {
    warnFallback();
    await updateRows<User>(USERS_FILE, reviveUser, rows => {
      const existing = rows.find(row => row.openId === user.openId);
      const now = new Date();

      if (existing) {
        const textFields = ["name", "email", "loginMethod"] as const;
        for (const field of textFields) {
          if (user[field] !== undefined) existing[field] = user[field] ?? null;
        }
        if (user.role !== undefined) existing.role = user.role;
        else if (user.openId === ENV.ownerOpenId) existing.role = "admin";
        if (user.lastSignedIn !== undefined) existing.lastSignedIn = user.lastSignedIn;
        else existing.lastSignedIn = now;
        existing.updatedAt = now;
      } else {
        rows.push({
          id: rows.reduce((max, row) => Math.max(max, row.id), 0) + 1,
          openId: user.openId,
          name: user.name ?? null,
          email: user.email ?? null,
          loginMethod: user.loginMethod ?? null,
          role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
          createdAt: now,
          updatedAt: now,
          lastSignedIn: user.lastSignedIn ?? now,
        });
      }
    });
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();

  if (!db) {
    const { rows } = await readRows<User>(USERS_FILE, reviveUser);
    return rows.find(row => row.openId === openId);
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createParticipant(input: InsertParticipant) {
  const db = await getDb();

  if (!db) {
    warnFallback();
    let id = 0;
    await updateRows<Participant>(PARTICIPANTS_FILE, reviveParticipant, rows => {
      id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
      rows.push({
        id,
        lastName: input.lastName,
        firstName: input.firstName,
        country: input.country,
        photoUrl: input.photoUrl ?? null,
        createdAt: input.createdAt ?? new Date(),
      });
    });
    return { id, ...input };
  }

  const result = await db.insert(participants).values(input);
  return { id: Number(result[0].insertId), ...input };
}

export async function listParticipants() {
  const db = await getDb();

  if (!db) {
    warnFallback();
    const { rows } = await readRows<Participant>(PARTICIPANTS_FILE, reviveParticipant);
    return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  return db.select().from(participants).orderBy(desc(participants.createdAt));
}

export async function deleteParticipant(id: number) {
  const db = await getDb();

  if (!db) {
    warnFallback();
    await updateRows<Participant>(PARTICIPANTS_FILE, reviveParticipant, rows => {
      const index = rows.findIndex(row => row.id === id);
      if (index >= 0) rows.splice(index, 1);
    });
    return { success: true } as const;
  }

  await db.delete(participants).where(eq(participants.id, id));
  return { success: true } as const;
}
