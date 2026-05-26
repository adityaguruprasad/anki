const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;

const MILLISECONDS_PER_MINUTE = 60 * 1000;

function parseIsoTimestamp(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const timestamp = value;
  if (timestamp.length === 0) {
    return null;
  }

  const match = timestamp.match(ISO_TIMESTAMP_PATTERN);
  if (match === null) {
    return null;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionalSecondText = '',
    offsetText,
    offsetSign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetText === 'Z' ? 0 : Number(offsetHourText);
  const offsetMinute = offsetText === 'Z' ? 0 : Number(offsetMinuteText);

  if (
    month < 1
    || month > 12
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59
  ) {
    return null;
  }

  const utcDay = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDay.getUTCFullYear() !== year
    || utcDay.getUTCMonth() !== month - 1
    || utcDay.getUTCDate() !== day
  ) {
    return null;
  }

  const microsecond = Number((fractionalSecondText + '000000').slice(0, 6));
  const millisecond = Math.floor(microsecond / 1000);
  const offsetMinutes = offsetText === 'Z'
    ? 0
    : (offsetHour * 60 + offsetMinute) * (offsetSign === '-' ? -1 : 1);
  const epochMilliseconds = (
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
    - offsetMinutes * MILLISECONDS_PER_MINUTE
  );

  return {
    epochMilliseconds,
    microsecondRemainder: microsecond % 1000,
  };
}

function isValidIsoTimestamp(value) {
  return parseIsoTimestamp(value) !== null && !Number.isNaN(Date.parse(value));
}

function isSameIsoTimestampInstant(left, right) {
  const leftTimestamp = parseIsoTimestamp(left);
  const rightTimestamp = parseIsoTimestamp(right);

  return (
    leftTimestamp !== null
    && rightTimestamp !== null
    && !Number.isNaN(Date.parse(left))
    && !Number.isNaN(Date.parse(right))
    && leftTimestamp.epochMilliseconds === rightTimestamp.epochMilliseconds
    && leftTimestamp.microsecondRemainder === rightTimestamp.microsecondRemainder
  );
}

module.exports = {
  isSameIsoTimestampInstant,
  isValidIsoTimestamp,
};
