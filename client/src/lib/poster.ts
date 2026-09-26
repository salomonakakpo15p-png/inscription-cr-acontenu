import { EVENT } from "@shared/event";

/** Every poster is rendered on a 1200×1200 canvas; the artwork itself is 2450×2450. */
export const POSTER_SIZE = 1200;

/**
 * Black photo window of the artwork, measured on the 2450×2450 source and
 * scaled to the canvas. It is a slightly skewed quadrilateral with rounded
 * corners (not a plain rectangle), so the four corners are kept as measured.
 */
const FRAME_CORNERS: Array<[number, number]> = [
  [242.65, 311.25],
  [758.9, 286.68],
  [765.95, 676.52],
  [248.96, 700.9],
];
const FRAME_RADIUS = 77.88;
/** Pushed outward so the photo covers the black area edge to edge. */
const FRAME_GROW = 2;

const center = FRAME_CORNERS.reduce(
  (acc, point) => [acc[0] + point[0] / 4, acc[1] + point[1] / 4],
  [0, 0],
);

const WINDOW: Array<[number, number]> = FRAME_CORNERS.map(([x, y]) => {
  const dx = x - center[0];
  const dy = y - center[1];
  const length = Math.hypot(dx, dy);
  return [x + (dx / length) * FRAME_GROW, y + (dy / length) * FRAME_GROW];
});

const WINDOW_BOX = {
  x: Math.min(...WINDOW.map(point => point[0])),
  y: Math.min(...WINDOW.map(point => point[1])),
  width: Math.max(...WINDOW.map(point => point[0])) - Math.min(...WINDOW.map(point => point[0])),
  height: Math.max(...WINDOW.map(point => point[1])) - Math.min(...WINDOW.map(point => point[1])),
};

export type PhotoTransform = { zoom: number; offsetX: number; offsetY: number };

/** Values printed on the orange label of the artwork. */
export type PosterIdentity = { lastName: string; firstName: string; country: string };

/** The artwork file is square; layout below is expressed in its own pixels. */
const ARTWORK_SIZE = 1400;

/** Baselines measured on the artwork for the "Nom / Prénom / Pays" labels. */
const IDENTITY_ROWS = [
  { field: "lastName" as const, baseline: 921 },
  { field: "firstName" as const, baseline: 964 },
  { field: "country" as const, baseline: 1007 },
];
/** One straight column for the values, just after the longest label ("Prénom:"). */
const IDENTITY_VALUE_X = 632;
const IDENTITY_RIGHT = 1030;
/** The orange label box is tilted; the values are drawn parallel to it. */
const IDENTITY_TILT_DEG = -3.22;
const IDENTITY_FONT_PX = 35;
const IDENTITY_FONT_MIN_PX = 24;
const IDENTITY_COLOR = "#000000";
const IDENTITY_FONT_STACK = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

const toCanvas = (value: number) => (value / ARTWORK_SIZE) * POSTER_SIZE;

function setIdentityFont(ctx: CanvasRenderingContext2D, size: number) {
  ctx.font = `italic bold ${toCanvas(size)}px ${IDENTITY_FONT_STACK}`;
}

/** Shrinks the font (then ellipsises) so the value always fits its row. */
function fitIdentityValue(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  let size = IDENTITY_FONT_PX;
  setIdentityFont(ctx, size);
  while (size > IDENTITY_FONT_MIN_PX && ctx.measureText(value).width > maxWidth) {
    size -= 1;
    setIdentityFont(ctx, size);
  }
  if (ctx.measureText(value).width <= maxWidth) return value;

  let trimmed = value;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function drawIdentity(ctx: CanvasRenderingContext2D, identity: PosterIdentity) {
  const x = toCanvas(IDENTITY_VALUE_X);
  const pivotY = toCanvas(IDENTITY_ROWS[0].baseline);
  const maxWidth = toCanvas(IDENTITY_RIGHT - IDENTITY_VALUE_X);
  ctx.save();
  ctx.fillStyle = IDENTITY_COLOR;
  ctx.textBaseline = "alphabetic";
  ctx.translate(x, pivotY);
  ctx.rotate((IDENTITY_TILT_DEG * Math.PI) / 180);
  for (const row of IDENTITY_ROWS) {
    const value = identity[row.field]?.trim();
    if (!value) continue;
    ctx.fillText(fitIdentityValue(ctx, value, maxWidth), 0, toCanvas(row.baseline) - pivotY);
  }
  ctx.restore();
}

export const defaultPhotoTransform: PhotoTransform = { zoom: 1, offsetX: 0, offsetY: 0 };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image impossible à charger"));
    image.src = src;
  });
}

function clipWindow(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  const last = WINDOW[WINDOW.length - 1];
  const first = WINDOW[0];
  ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
  for (let index = 0; index < WINDOW.length; index++) {
    const corner = WINDOW[index];
    const next = WINDOW[(index + 1) % WINDOW.length];
    ctx.arcTo(corner[0], corner[1], next[0], next[1], FRAME_RADIUS);
  }
  ctx.closePath();
  ctx.clip();
}

/**
 * Draws the poster and, when a photo is given, covers the whole black window
 * with it (centered on the detected face). Resolves with a PNG data URL used
 * for both the preview and the download.
 */
export async function composePoster(
  photoData?: string,
  transform: PhotoTransform = defaultPhotoTransform,
  identity?: PosterIdentity,
): Promise<string> {
  const poster = await loadImage(EVENT.posterUrl);
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_SIZE;
  canvas.height = POSTER_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Génération impossible");

  ctx.drawImage(poster, 0, 0, POSTER_SIZE, POSTER_SIZE);

  if (photoData) {
    const photo = await loadImage(photoData);
    ctx.save();
    clipWindow(ctx);
    const scale = Math.max(WINDOW_BOX.width / photo.width, WINDOW_BOX.height / photo.height) * transform.zoom;
    const width = photo.width * scale;
    const height = photo.height * scale;
    const shiftX = (width - WINDOW_BOX.width) * (transform.offsetX / 200);
    const shiftY = (height - WINDOW_BOX.height) * (transform.offsetY / 200);
    const originX = WINDOW_BOX.x + WINDOW_BOX.width / 2 - width / 2 + shiftX;
    const originY = WINDOW_BOX.y + WINDOW_BOX.height / 2 - height / 2 + shiftY;
    ctx.drawImage(photo, originX, originY, width, height);
    ctx.restore();
  }

  if (identity) drawIdentity(ctx, identity);

  return canvas.toDataURL("image/png");
}
