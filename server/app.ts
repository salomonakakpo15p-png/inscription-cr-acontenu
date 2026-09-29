import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { LOCAL_UPLOAD_DIR } from "./storage";
import { blobReadFile, isBlobEnabled } from "./blob";

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
  if (isBlobEnabled()) {
    // Photos live in Vercel Blob: stream them through the function so the
    // store can stay private.
    app.get("/uploads/*", async (req, res) => {
      try {
        const file = await blobReadFile(String((req.params as Record<string, string>)[0] ?? ""));
        if (!file) {
          res.status(404).type("text/plain").end("Fichier introuvable");
          return;
        }
        res.setHeader("Content-Type", file.contentType);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.end(file.data);
      } catch (error) {
        console.error("[uploads] lecture impossible:", error);
        res.status(500).type("text/plain").end("Lecture de la photo impossible");
      }
    });
  } else {
    app.use(
      "/uploads",
      express.static(LOCAL_UPLOAD_DIR, {
        index: false,
        fallthrough: false,
        setHeaders: res => res.setHeader("Cache-Control", "public, max-age=31536000, immutable"),
      }),
    );
  }
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
