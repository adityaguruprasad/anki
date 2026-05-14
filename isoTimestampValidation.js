const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidIsoTimestamp(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const timestamp = value;
  if (timestamp.length === 0) {
    return false;
  }

  const match = timestamp.match(ISO_TIMESTAMP_PATTERN);
  if (match === null) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const utcDay = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDay.getUTCFullYear() !== year ||
    utcDay.getUTCMonth() !== month - 1 ||
    utcDay.getUTCDate() !== day
  ) {
    return false;
  }

  return !Number.isNaN(Date.parse(timestamp));
}

module.exports = {
  isValidIsoTimestamp,
};
