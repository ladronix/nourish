/** Date helpers. All "days" are ISO yyyy-mm-dd strings in Europe/Prague. */
export const TZ = "Europe/Prague";

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function nowHHMM(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return new Date(iso + "T12:00:00Z").getUTCDay();
}

/** Monday of the ISO week containing `iso`. */
export function weekStart(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isoWeekNumber(iso: string): number {
  const d = new Date(iso + "T12:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

const DAY_SHORT = ["NE", "PO", "ÚT", "ST", "ČT", "PÁ", "SO"];
const DAY_LONG = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
const MONTHS_GEN = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];

export function dayShort(iso: string) {
  return DAY_SHORT[weekday(iso)];
}
export function dayLong(iso: string) {
  return DAY_LONG[weekday(iso)];
}
export function dayNum(iso: string) {
  return Number(iso.slice(8, 10));
}
export function longDate(iso: string) {
  return `${dayLong(iso)} ${dayNum(iso)}. ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]}`;
}

export function relativeDays(target: string, today: string): string {
  const d = diffDays(target, today);
  if (d < 0) return d === -1 ? "včera" : `před ${-d} dny`;
  if (d === 0) return "dnes";
  if (d === 1) return "zítra";
  if (d < 5) return `${d} dny`;
  return `${d} dní`;
}

/** Timestamp `days` ago (kept out of components for render purity). */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}
