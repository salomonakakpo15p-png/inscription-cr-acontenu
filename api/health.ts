import { get, head, put } from "@vercel/blob";

// Inside Vercel functions the OIDC token is delivered through the platform
// request context (it is not an env var); expose whether it is there.
function hasOidcContextToken(): boolean {
  const holder = (globalThis as unknown as Record<symbol, { get?: () => { headers?: Record<string, string | undefined> } } | undefined>)[
    Symbol.for("@vercel/request-context")
  ];
  return Boolean(holder?.get?.()?.headers?.["x-vercel-oidc-token"]);
}

function errText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

// Diagnostic: is the etag reported by get() the one put(ifMatch) expects?
async function etagDiag(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  try {
    const h = await head("participants.json", {});
    const g = await get("participants.json", { access: "private", useCache: false });
    out.headEtag = h.etag?.slice(0, 20) ?? null;
    out.getEtag = g?.blob?.etag?.slice(0, 20) ?? null;
    out.etagsAgree = h.etag === g?.blob?.etag;
    out.size = h.size;
  } catch (error) {
    out.readError = errText(error);
  }
  try {
    await put("health-probe.json", "v1", { access: "private", allowOverwrite: true, contentType: "text/plain" });
    const fresh = await get("health-probe.json", { access: "private", useCache: false });
    const etag = fresh?.blob?.etag;
    try {
      await put("health-probe.json", "v2", { access: "private", allowOverwrite: true, contentType: "text/plain", ifMatch: etag });
      out.conditionalWrite = "ok";
    } catch (error) {
      out.conditionalWrite = errText(error);
    }
    out.scratchEtag = etag?.slice(0, 20) ?? null;

    // Same flow as the app: read participants.json and rewrite it unchanged,
    // once with the weak etag from get() and once with the strong etag from
    // head() — both writes are byte-identical, so they change nothing.
    const read = await get("participants.json", { access: "private", useCache: false });
    if (!read || read.statusCode !== 200 || !read.stream) throw new Error("participants.json unreadable");
    const body = await new Response(read.stream).text();
    const weak = read.blob.etag;
    const opts = { access: "private" as const, allowOverwrite: true, contentType: "application/json" };
    try {
      await put("participants.json", body, { ...opts, ifMatch: weak });
      out.rewriteWithGetEtag = "ok";
    } catch (error) {
      out.rewriteWithGetEtag = errText(error);
    }
    try {
      const strong = (await head("participants.json", {})).etag;
      await put("participants.json", body, { ...opts, ifMatch: strong });
      out.rewriteWithHeadEtag = "ok";
    } catch (error) {
      out.rewriteWithHeadEtag = errText(error);
    }
  } catch (error) {
    out.conditionalWrite = `setup: ${errText(error)}`;
  }
  return out;
}

// Health endpoint used to check that Vercel functions are reachable and that
// the required environment (admin, session, storage) is actually delivered.
export default async function handler(_req: unknown, res: {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}) {
  // A connected store provides `BLOB_STORE_ID`; in functions the OIDC token is
  // carried by the request context, not by an env var — so probe for real.
  const blobConfigured = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

  // Live credential check: "not found" proves the store is reachable, any
  // other answer (missing credentials, forbidden) explains why not.
  let blobProbe: string | null = null;
  if (blobConfigured) {
    try {
      await head("health-probe.json", {});
      blobProbe = "ok";
    } catch (error) {
      blobProbe = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Booleans and error strings only: never exposes a secret value.
  res.end(
    JSON.stringify({
      ok: true,
      node: process.version,
      vercel: Boolean(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV ?? null,
      adminConfigured: Boolean(process.env.ADMIN_PASSWORD),
      jwtConfigured: Boolean(process.env.JWT_SECRET),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      blobConfigured,
      blobProbe,
      hasOidcContext: hasOidcContextToken(),
      etagDiag: await etagDiag(),
    }),
  );
}
