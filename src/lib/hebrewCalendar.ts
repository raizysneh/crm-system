import { HDate, HebrewCalendar, flags } from "@hebcal/core";

// Holidays/observances worth showing on a business calendar — excludes very
// minor or non-mainstream civil observances that would just be noise.
const EXCLUDED_DESC_PREFIXES = [
  "Hebrew Language Day",
  "Family Day",
  "Yom HaAliyah",
  "Herzl Day",
  "Rosh Hashana LaBehemot",
  "Leil Selichot",
  "Ben-Gurion Day",
  "Jabotinsky Day",
  "Chag HaBanot",
];

const HOLIDAY_MASK =
  flags.CHAG | flags.MODERN_HOLIDAY | flags.MINOR_HOLIDAY |
  flags.MAJOR_FAST | flags.MINOR_FAST | flags.CHOL_HAMOED | flags.EREV;

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// e.g. "ז׳ אב תשפ״ו" (compact=true drops the year: "ז׳ אב")
export function getHebrewDateStr(date: Date, compact = false): string {
  const full = new HDate(date).renderGematriya(true); // no nikud
  if (!compact) return full;
  const parts = full.split(" ");
  return parts.slice(0, 2).join(" ");
}

// yyyy-mm-dd -> Hebrew holiday/observance names for that date
export function getIsraeliHolidays(from: Date, to: Date): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const events = HebrewCalendar.calendar({
    start: from,
    end: to,
    il: true,
    candlelighting: false,
    sedrot: false,
    omer: false,
    noRoshChodesh: true,
  }).filter(ev => {
    if ((ev.getFlags() & HOLIDAY_MASK) === 0) return false;
    const desc = ev.getDesc();
    return !EXCLUDED_DESC_PREFIXES.some(p => desc.startsWith(p));
  });

  for (const ev of events) {
    const key = toYMD(ev.getDate().greg());
    const name = ev.render("he-x-NoNikud");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(name);
  }
  return map;
}
