/**
 * Wall-clock time in a named time zone ⇄ UTC, using only Intl (works in Node and browsers, no dependency).
 * Booking hours and event times are typed by people in their own zone; everything is stored in UTC.
 */

function partsIn(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

/** Offset of `timeZone` from UTC at `date`, in minutes (Bucharest in summer: +180). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** UTC instant of a wall-clock time (`2026-03-29`, minutes after midnight) in `timeZone`. Handles DST changes. */
export function zonedToUtc(day: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let t = guess - tzOffsetMinutes(new Date(guess), timeZone) * 60000;
  t = guess - tzOffsetMinutes(new Date(t), timeZone) * 60000; // second pass settles DST edges
  return new Date(t);
}

/** Wall-clock day (YYYY-MM-DD), minutes after midnight and weekday of an instant in `timeZone`. */
export function utcToZoned(date: Date, timeZone: string): { day: string; minutes: number; weekday: number } {
  const p = partsIn(date, timeZone);
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday ?? 'Mon');
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday };
}

/** `2026-03-29T10:30` typed in `timeZone` → ISO UTC. Null when malformed. */
export function localInputToIso(value: string, timeZone: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return zonedToUtc(m[1]!, Number(m[2]) * 60 + Number(m[3]), timeZone).toISOString();
}

/** ISO UTC → `2026-03-29T10:30` as shown in `timeZone` (for datetime-local inputs). */
export function isoToLocalInput(iso: string, timeZone: string): string {
  const z = utcToZoned(new Date(iso), timeZone);
  const hh = String(Math.floor(z.minutes / 60)).padStart(2, '0');
  const mm = String(z.minutes % 60).padStart(2, '0');
  return `${z.day}T${hh}:${mm}`;
}

export const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const hhmmToMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const minutesToHhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
