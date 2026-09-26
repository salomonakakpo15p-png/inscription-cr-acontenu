/**
 * Single source of truth for the event.
 * Change a value here and every page (client and server) follows.
 */
export const EVENT = {
  day: 24,
  monthShort: "OCT.",
  monthLong: "octobre",
  year: 2026,
  time: "21H GMT+1",
  opensAt: "20H45",
  /** Served from client/public: no extra network hop on first paint. */
  posterUrl: "/affiche-24-octobre-2026.jpg",
} as const;

/** "24 octobre 2026" */
export const EVENT_DATE_LONG = `${EVENT.day} ${EVENT.monthLong} ${EVENT.year}`;
/** "24 oct. 2026" */
export const EVENT_DATE_SHORT = `${EVENT.day} ${EVENT.monthShort.toLowerCase()} ${EVENT.year}`;
/** "24 OCTOBRE 2026" */
export const EVENT_DATE_UPPER = `${EVENT.day} ${EVENT.monthLong.toUpperCase()} ${EVENT.year}`;
/** "24 octobre 2026 à 21H GMT+1" */
export const EVENT_DATETIME_LONG = `${EVENT_DATE_LONG} à ${EVENT.time}`;
