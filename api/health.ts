// Health endpoint used to check that Vercel functions are reachable.
export default function handler(_req: unknown, res: {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Names only (never values): shows which variables the function actually
  // receives, so a typo such as Admin_Password is visible immediately.
  const seenKeys = Object.keys(process.env)
    .filter(key => /ADMIN|JWT|DATABASE|MYSQL|OAUTH|OWNER|PASS|SECRET|TOKEN|VITE_/i.test(key))
    .sort();
  res.end(
    JSON.stringify({
      ok: true,
      node: process.version,
      vercel: Boolean(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV ?? null,
      envCount: Object.keys(process.env).length,
      seenKeys,
      // booleans only: tell whether the required variables are picked up
      adminConfigured: Boolean(process.env.ADMIN_PASSWORD),
      jwtConfigured: Boolean(process.env.JWT_SECRET),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      blobConfigured: Boolean(
        process.env.BLOB_READ_WRITE_TOKEN ||
          (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
      ),
    }),
  );
}
