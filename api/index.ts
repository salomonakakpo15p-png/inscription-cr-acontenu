// Vercel function entrypoint.
// The platform serves the built client from `dist/public` (see vercel.json)
// and forwards /api/* and /uploads/* here, keeping the original request path,
// so Express routes them exactly like the standalone server does.
import { createApp } from "../server/app";

export default createApp();
