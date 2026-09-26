// Vercel function entrypoint.
// The platform serves the built client from `dist/public` (see vercel.json)
// and forwards /api/* and /uploads/* here, keeping the original request path,
// so Express routes them exactly like the standalone server does.
//
// The app is loaded lazily: if anything in the server bundle fails to start,
// the caller gets a readable error instead of a bare FUNCTION_INVOCATION_FAILED.
import type { IncomingMessage, ServerResponse } from "node:http";

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

let appPromise: Promise<Handler> | null = null;

function loadApp(): Promise<Handler> {
  if (!appPromise) {
    appPromise = import("../server/app").then(mod => mod.createApp() as unknown as Handler);
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await loadApp();
    return app(req, res);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[api/index] app init failed:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`APP_INIT_FAILED: ${message}`);
  }
}
