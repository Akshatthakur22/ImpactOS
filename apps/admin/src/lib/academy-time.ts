function partsInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function calendarDateInTimezone(value: Date, timezone: string) {
  const parts = partsInTimezone(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function academyMidnightUtc(calendarDate: string, timezone: string) {
  const dateParts = calendarDate.split("-").map(Number);
  const year = dateParts[0] ?? 0;
  const month = dateParts[1] ?? 1;
  const day = dateParts[2] ?? 1;
  let guess = Date.UTC(year, month - 1, day);
  const target = guess;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = partsInTimezone(new Date(guess), timezone);
    const representedAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const adjustment = target - representedAsUtc;
    if (!adjustment) break;
    guess += adjustment;
  }
  return new Date(guess);
}

function nextCalendarDate(value: string) {
  const dateParts = value.split("-").map(Number);
  const year = dateParts[0] ?? 0;
  const month = dateParts[1] ?? 1;
  const day = dateParts[2] ?? 1;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function dateRangeInTimezone(from: string, to: string, timezone: string) {
  const fromAt = academyMidnightUtc(from, timezone);
  const toExclusive = academyMidnightUtc(nextCalendarDate(to), timezone);
  return {
    from: fromAt.toISOString(),
    to: new Date(toExclusive.getTime() - 1).toISOString(),
  };
}

export function dateTimeInputInTimezone(value: Date, timezone: string) {
  const parts = partsInTimezone(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function dateTimeInTimezone(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid date and time.");
  const yearText = match[1] ?? "0";
  const monthText = match[2] ?? "1";
  const dayText = match[3] ?? "1";
  const hourText = match[4] ?? "0";
  const minuteText = match[5] ?? "0";
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = partsInTimezone(new Date(guess), timezone);
    const representedAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const adjustment = target - representedAsUtc;
    if (!adjustment) break;
    guess += adjustment;
  }
  return new Date(guess).toISOString();
}
