import { get, head, put, BlobPreconditionFailedError } from "@vercel/blob";

/**
 * Vercel Blob is used as soon as a store is connected to the project. Inside
 * functions the SDK picks the OIDC token up from the platform request context
 * (`BLOB_STORE_ID`), and falls back to `BLOB_READ_WRITE_TOKEN` elsewhere.
 * Without either, the app keeps writing to the local disk (development).
 */
export function isBlobEnabled(): boolean {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

export function isPreconditionFailed(error: unknown): boolean {
  return error instanceof BlobPreconditionFailedError;
}

export type BlobText = { text: string; etag?: string };

/**
 * A cached read hands back a weak validator (`W/"…"`), while `ifMatch`
 * performs a strong comparison — the write would then be rejected even though
 * nothing changed. The opaque hash is identical, so drop the prefix.
 */
function strongEtag(etag: string): string {
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

/** Reads a JSON document; `null` when the blob does not exist yet. */
export async function blobReadText(pathname: string): Promise<BlobText | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return { text, etag: result.blob.etag ? strongEtag(result.blob.etag) : undefined };
}

/** Writes a JSON document; `ifMatch` guards against concurrent writers. */
export async function blobWriteText(pathname: string, text: string, etag?: string): Promise<void> {
  await put(pathname, text, {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    ...(etag ? { ifMatch: strongEtag(etag) } : {}),
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
