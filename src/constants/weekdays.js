/** Códigos y etiquetas de los días de la semana. */

export const WEEKDAY_CODES = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];

export const WEEKDAY_LABELS = {
  DOM: 'Domingo',
  LUN: 'Lunes',
  MAR: 'Martes',
  MIE: 'Miércoles',
  JUE: 'Jueves',
  VIE: 'Viernes',
  SAB: 'Sábado',
};

export const WEEKDAY_OPTIONS = [
  { code: 'LUN', label: 'Lunes' },
  { code: 'MAR', label: 'Martes' },
  { code: 'MIE', label: 'Miércoles' },
  { code: 'JUE', label: 'Jueves' },
  { code: 'VIE', label: 'Viernes' },
  { code: 'SAB', label: 'Sábado' },
  { code: 'DOM', label: 'Domingo' },
];

/** Código del día de hoy, por ejemplo 'MIE'. */
export function getTodayCode(date = new Date()) {
  return WEEKDAY_CODES[date.getDay()];
}

export function isExtraCode(dayCode) {
  return typeof dayCode === 'string' && dayCode.startsWith('EXTRA');
}

/** Etiqueta para mostrar: "Miércoles" o "Extra". */
export function getDayLabel(dayCode) {
  if (!dayCode) return 'Sin día';
  if (isExtraCode(dayCode)) return 'Extra';
  return WEEKDAY_LABELS[dayCode] || dayCode;
}
