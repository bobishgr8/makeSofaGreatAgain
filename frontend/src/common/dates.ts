const SINGAPORE = "Asia/Singapore";

// "12 Sep 2024". Accepts a full ISO timestamp or a YYYY-MM-DD date.
export function formatDate(value?: string | null) {
  if (!value) return "";
  // A bare date has no time zone; pin it to midday so it can't shift a day.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+08:00` : value);
  if (Number.isNaN(date.getTime())) return "";
  // Built from parts: en-GB/en-SG print "Sept" in newer browsers.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: SINGAPORE,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}`;
}

// Today in Singapore as YYYY-MM-DD, for <input type="date" min=...>.
export function todaySgt() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SINGAPORE,
  }).format(new Date());
}
