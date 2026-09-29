import { head } from "@vercel/blob";

// Inside Vercel functions the OIDC token is delivered through the platform
// request context (it is not an env var); expose whether it is there.
function hasOidcContextToken(): boolean {
  const holder = (globalThis as unknown as Record<symbol, { get?: () => { headers?: Record<string, string | undefined> } } | undefined>)[
    Symbol.for("@vercel/request-context")
  ];
  return Boolean(holder?.get?.()?.headers?.["x-vercel-oidc-token"]);
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
  // Names only, never values: shows which variables the function receives, so
  // a missing store or a typo such as Admin_Password is visible immediately.
  res.end(
    JSON.stringify({
      ok: true,
      node: process.version,
      vercel: Boolean(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV ?? null,
      envCount: Object.keys(process.env).length,
      envKeys: Object.keys(process.env).sort(),
      adminConfigured: Boolean(process.env.ADMIN_PASSWORD),
      jwtConfigured: Boolean(process.env.JWT_SECRET),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      blobConfigured,
      blobProbe,
      hasOidcContext: hasOidcContextToken(),
    }),
  );
}
