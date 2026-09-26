import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { LOCAL_UPLOAD_DIR } from "./storage";

/**
 * Builds the Express application (body parsing, OAuth routes, local uploads
 * and the tRPC API). Used by the standalone server (server/_core/index.ts)
 * and by the Vercel function (api/index.ts), so both expose the exact same
 * routes.
 *
 * Static assets and the SPA fallback are intentionally NOT mounted here:
 * on Vercel they are served by the platform from `dist/public`.
 */
export function createApp() {
  const app = express();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Local uploads (used when the remote storage backend is not configured).
  app.use(
    "/uploads",
    express.static(LOCAL_UPLOAD_DIR, {
      index: false,
      fallthrough: false,
      setHeaders: res => res.setHeader("Cache-Control", "public, max-age=31536000, immutable"),
    }),
  );
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );
  return app;
}
