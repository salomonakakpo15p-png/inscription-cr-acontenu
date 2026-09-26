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

// Local file fallback used when DATABASE_URL is not configured, so
// registrations still work on a machine without a MySQL server.
const DATA_DIR = path.resolve(process.cwd(), "data");
const PARTICIPANTS_FILE = path.join(DATA_DIR, "participants.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

type Serialized<T> = Omit<T, "createdAt"> & { createdAt: string | Date };

function warnFallback() {
  if (_warned) return;
  _warned = true;
  console.warn(
    `[Database] DATABASE_URL is not set — using local file storage in ${DATA_DIR}`,
  );
}

async function readRows<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeRows(file: string, rows: unknown[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
  await fs.rename(tmp, file);
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
    const rows = (await readRows<Serialized<User>>(USERS_FILE)).map(reviveUser);
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

    await writeRows(USERS_FILE, rows);
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
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();

  if (!db) {
    const rows = await readRows<Serialized<User>>(USERS_FILE);
    return rows.map(reviveUser).find(row => row.openId === openId);
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createParticipant(input: InsertParticipant) {
  const db = await getDb();

  if (!db) {
    warnFallback();
    const rows = (await readRows<Serialized<Participant>>(PARTICIPANTS_FILE)).map(reviveParticipant);
    const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    rows.push({
      id,
      lastName: input.lastName,
      firstName: input.firstName,
      country: input.country,
      photoUrl: input.photoUrl ?? null,
      createdAt: input.createdAt ?? new Date(),
    });
    await writeRows(PARTICIPANTS_FILE, rows);
    return { id, ...input };
  }

  const result = await db.insert(participants).values(input);
  return { id: Number(result[0].insertId), ...input };
}

export async function listParticipants() {
  const db = await getDb();

  if (!db) {
    warnFallback();
    const rows = (await readRows<Serialized<Participant>>(PARTICIPANTS_FILE)).map(reviveParticipant);
    return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  return db.select().from(participants).orderBy(desc(participants.createdAt));
}

export async function deleteParticipant(id: number) {
  const db = await getDb();

  if (!db) {
    warnFallback();
    const rows = (await readRows<Serialized<Participant>>(PARTICIPANTS_FILE))
      .map(reviveParticipant)
      .filter(row => row.id !== id);
    await writeRows(PARTICIPANTS_FILE, rows);
    return { success: true } as const;
  }

  await db.delete(participants).where(eq(participants.id, id));
  return { success: true } as const;
}
