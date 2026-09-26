// Health endpoint used to check that Vercel functions are reachable.
export default function handler(_req: unknown, res: {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true, node: process.version, vercel: Boolean(process.env.VERCEL) }));
}
