import { createApp } from "../server/app";

// Bundled into api/index.js by `pnpm run build` (see package.json) so the
// Vercel function is self-contained: the platform does not compile the
// TypeScript sources living outside the api/ directory.
export default createApp();
