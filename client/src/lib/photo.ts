import { loadImage } from "./poster";

/**
 * Downscale and re-encode a photo so the payload stays well below the 4.5 MB
 * request limit of serverless hosts (Vercel) while keeping enough detail for
 * the poster (drawn at most ~700px wide, with a zoom up to 2.2x).
 */
export async function compressPhoto(dataUrl: string): Promise<string> {
  try {
    const image = await loadImage(dataUrl);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, width, height);

    // base64 inflates the payload by ~37%, keep the string below 3.5M chars.
    const maxChars = 3_500_000;
    let quality = 0.85;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > maxChars && quality > 0.5) {
      quality = Math.round((quality - 0.15) * 100) / 100;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    return out;
  } catch {
    return dataUrl;
  }
}
