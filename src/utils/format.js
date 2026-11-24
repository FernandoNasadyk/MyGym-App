/**
 * Helpers de fechas y números para mostrar en pantalla.
 * Se implementan a mano (sin Intl) para que se vean igual en Android, iOS y web.
 */

const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEKDAYS_LONG = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];
const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Fecha local en formato YYYY-MM-DD (el que se guarda en SQLite). */
export function toISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODate(isoDate) {
  if (typeof isoDate !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day, weekday: date.getDay(), date };
}

export function formatWeekdayShort(isoDate) {
  const parsed = parseISODate(isoDate);
  return parsed ? WEEKDAYS_SHORT[parsed.weekday] : '';
}

/** "lun 17/11" */
export function formatDateShort(isoDate) {
  const parsed = parseISODate(isoDate);
  if (!parsed) return '';
  return `${WEEKDAYS_SHORT[parsed.weekday]} ${String(parsed.day).padStart(
    2,
    '0'
  )}/${String(parsed.month).padStart(2, '0')}`;
}

/** "lun 17 nov" */
export function formatDateLong(isoDate) {
  const parsed = parseISODate(isoDate);
  if (!parsed) return '';
  return `${WEEKDAYS_SHORT[parsed.weekday]} ${parsed.day} ${
    MONTHS_SHORT[parsed.month - 1]
  }`;
}

/** "Hoy", "Ayer" o "lun 17 nov". */
export function formatRelativeDate(isoDate, todayISO = toISODate()) {
  if (!isoDate) return '';
  if (isoDate === todayISO) return 'Hoy';

  const todayParsed = parseISODate(todayISO);
  if (todayParsed) {
    const yesterday = new Date(
      todayParsed.year,
      todayParsed.month - 1,
      todayParsed.day - 1
    );
    if (toISODate(yesterday) === isoDate) return 'Ayer';
  }

  return formatDateLong(isoDate);
}

/** "Miércoles 19 de noviembre" */
export function formatTodayLong(date = new Date()) {
  const weekday = WEEKDAYS_LONG[date.getDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date.getDate()} de ${
    MONTHS_LONG[date.getMonth()]
  }`;
}

/** Día y mes para el badge del historial: { day: "17", month: "nov" } */
export function getDateBadgeParts(isoDate) {
  const parsed = parseISODate(isoDate);
  if (!parsed) return { day: '--', month: '' };
  return {
    day: String(parsed.day).padStart(2, '0'),
    month: MONTHS_SHORT[parsed.month - 1],
  };
}

/** 42.5 -> "42,5"; 40 -> "40" */
export function formatWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return String(Math.round(numeric * 100) / 100).replace('.', ',');
}

/** 1240 -> "1.240" */
export function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return String(Math.round(numeric)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatVolume(value) {
  return `${formatNumber(value)} kg`;
}
