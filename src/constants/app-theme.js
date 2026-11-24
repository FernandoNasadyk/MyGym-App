/**
 * Tokens de diseño de My Gym.
 * Un solo lugar para colores, espacios y radios así las pantallas se ven
 * consistentes.
 */

const darkShadow = {
  shadowColor: '#000000',
  shadowOpacity: 0.32,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const lightShadow = {
  shadowColor: '#0b3d27',
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};

/** Modo oscuro: verdes profundos sobre fondos casi negros. */
export const darkColors = {
  // Fondos
  bg: '#070c09',
  bgSoft: '#0a120e',
  surface: '#0f1a14',
  surfaceAlt: '#0b1510',
  surfaceHigh: '#13241b',

  // Bordes
  border: '#1c3225',
  borderStrong: '#2a4a36',

  // Verde principal
  primary: '#10b981',
  primaryStrong: '#059669',
  primarySoft: '#0a3b2a',
  primaryBorder: '#1d7f5a',
  primaryText: '#6ee7b7',
  // Texto sobre botones de verde sólido
  onPrimary: '#f2fbf6',

  // Texto
  text: '#f2fbf6',
  textSecondary: '#b9ccc1',
  textMuted: '#8ba398',
  textFaint: '#5f7a6c',

  // Estados
  danger: '#f87171',
  dangerStrong: '#b91c1c',
  dangerSoft: 'rgba(248, 113, 113, 0.10)',
  dangerBorder: 'rgba(248, 113, 113, 0.38)',
  warning: '#fbbf24',

  overlay: 'rgba(2, 6, 4, 0.74)',
  shadow: '#000000',
  cardShadow: darkShadow,
};

/** Modo claro: fondos verde menta muy suaves, superficies blancas y acentos esmeralda. */
export const lightColors = {
  // Fondos
  bg: '#eef7f1',
  bgSoft: '#e4f1e9',
  surface: '#fbfefc',
  surfaceAlt: '#f1f9f4',
  surfaceHigh: '#dcefe3',

  // Bordes
  border: '#c6dfd0',
  borderStrong: '#98c4ac',

  // Verde principal
  primary: '#059669',
  primaryStrong: '#047857',
  primarySoft: '#d3efdf',
  primaryBorder: '#6dbf93',
  primaryText: '#046b4b',
  onPrimary: '#ffffff',

  // Texto
  text: '#0a2a1b',
  textSecondary: '#2c5441',
  textMuted: '#4d6e5d',
  textFaint: '#6f8c7d',

  // Estados
  danger: '#b91c1c',
  dangerStrong: '#b91c1c',
  dangerSoft: 'rgba(185, 28, 28, 0.08)',
  dangerBorder: 'rgba(185, 28, 28, 0.35)',
  warning: '#b45309',

  overlay: 'rgba(5, 32, 20, 0.5)',
  shadow: '#0b3d27',
  cardShadow: lightShadow,
};

export const themes = { dark: darkColors, light: lightColors };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};
