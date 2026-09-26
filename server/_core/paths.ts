import path from "node:path";

/**
 * Where local files (registrations JSON, uploads) are written when no
 * external backend (MySQL / Forge) is configured.
 * Serverless platforms such as Vercel only allow writes under /tmp, so the
 * directory moves there when the app runs on Vercel.
 */
export const LOCAL_DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "data")
  : path.resolve(process.cwd(), "data");
