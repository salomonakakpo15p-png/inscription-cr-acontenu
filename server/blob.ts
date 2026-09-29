import { get, head, put, BlobPreconditionFailedError } from "@vercel/blob";

/**
 * Vercel Blob is used as soon as a store is connected to the project: OIDC
 * credentials (`BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`) are added automatically,
 * and a store created from the dashboard also provides `BLOB_READ_WRITE_TOKEN`.
 * Without either, the app keeps writing to the local disk (development).
 */
export function isBlobEnabled(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  return Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN);
}

export function isPreconditionFailed(error: unknown): boolean {
  return error instanceof BlobPreconditionFailedError;
}

export type BlobText = { text: string; etag?: string };

/** Reads a JSON document; `null` when the blob does not exist yet. */
export async function blobReadText(pathname: string): Promise<BlobText | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return { text, etag: result.blob.etag };
}

/** Writes a JSON document; `ifMatch` guards against concurrent writers. */
export async function blobWriteText(pathname: string, text: string, etag?: string): Promise<void> {
  await put(pathname, text, {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    ...(etag ? { ifMatch: etag } : {}),
  });
}

/** Reads an uploaded file (participant photo) for delivery through Express. */
export async function blobReadFile(
  pathname: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const data = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { data, contentType: result.blob.contentType || "application/octet-stream" };
}

export async function blobHeadEtag(pathname: string): Promise<string | undefined> {
  try {
    const meta = await head(pathname, {});
    return meta.etag;
  } catch {
    return undefined;
  }
}
