function formatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function parts(date: Date, timeZone: string) {
  return Object.fromEntries(
    formatter(timeZone)
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
}

export function academyDate(date: Date, timeZone: string) {
  const value = parts(date, timeZone);
  return `${value.year}-${value.month}-${value.day}`;
}

export const calendarDateInTimezone = academyDate;

export function dateRangeInTimezone(from: string, to: string, timeZone: string) {
  const fromAt = academyLocalToUtc(`${from}T00:00`, timeZone);
  const [year, month, day] = to.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year!, month! - 1, day! + 1));
  const toDate = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDay.getUTCDate()).padStart(2, "0")}`;
  const toExclusive = academyLocalToUtc(`${toDate}T00:00`, timeZone);
  return { from: fromAt, to: new Date(new Date(toExclusive).getTime() - 1).toISOString() };
}

export function utcToAcademyInput(value: string, timeZone: string) {
  const formatted = parts(new Date(value), timeZone);
  return `${formatted.year}-${formatted.month}-${formatted.day}T${formatted.hour}:${formatted.minute}`;
}

export function dateTimeInputInTimezone(value: Date, timeZone: string) {
  return utcToAcademyInput(value.toISOString(), timeZone);
}

export const dateTimeInTimezone = academyLocalToUtc;

export function academyLocalToUtc(value: string, timeZone: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date!.split("-").map(Number);
  const [hour, minute] = time!.split(":").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = parts(new Date(guess), timeZone);
    const represented = Date.UTC(
      Number(local.year),
      Number(local.month) - 1,
      Number(local.day),
      Number(local.hour),
      Number(local.minute),
    );
    guess += target - represented;
  }
  const result = new Date(guess);
  const check = parts(result, timeZone);
  if (
    Number(check.year) !== year ||
    Number(check.month) !== month ||
    Number(check.day) !== day ||
    Number(check.hour) !== hour ||
    Number(check.minute) !== minute
  ) {
    throw new Error(
      "That wall-clock time does not exist in the academy timezone because of a daylight-saving change.",
    );
  }
  return result.toISOString();
}
