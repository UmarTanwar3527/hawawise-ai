/** "9 pm–10 pm" for an IST hour-of-day bucket (hour start). Client-safe. */
export function hourRangeLabel(hour: number): string {
  const label = (h: number) => {
    const value = h % 24;
    if (value === 0) return "12 am";
    if (value === 12) return "12 pm";
    return value < 12 ? `${value} am` : `${value - 12} pm`;
  };
  return `${label(hour)}–${label(hour + 1)}`;
}

/** "Mon 24 Nov" for an IST day key (YYYY-MM-DD). */
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${day}T12:00:00+05:30`),
  );
}
