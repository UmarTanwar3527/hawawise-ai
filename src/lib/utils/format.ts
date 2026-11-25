/**
 * Display formatting. Times are always shown in India Standard Time so
 * server and browser render the same text.
 */
const IST = "Asia/Kolkata";

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const weekdayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatTimeIst(iso: string): string {
  return `${timeFormatter.format(new Date(iso))} IST`;
}

export function formatDateTimeIst(iso: string): string {
  return `${dateTimeFormatter.format(new Date(iso))} IST`;
}

export function formatWeekdayIst(iso: string): string {
  return weekdayFormatter.format(new Date(iso));
}

/** Calendar day in IST as YYYY-MM-DD, for grouping hourly data by local day. */
export function istDayKey(iso: string): string {
  return dayKeyFormatter.format(new Date(iso));
}

/** "45 min", "2 h 30 min", "3 days". */
export function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  return `${Math.round(minutes / 1440)} days`;
}

/** Concentration with sensible precision: 1 decimal below 10, whole numbers above. */
export function formatConcentration(value: number): string {
  return value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("en-IN");
}
