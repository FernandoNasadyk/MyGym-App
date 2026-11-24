/**
 * Tokens de diseño de My Gym.
 * Un solo lugar para colores, espacios y radios así las pantallas se ven
 * consistentes.
 */

export const colors = {
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

  // Texto
  text: '#f2fbf6',
  textSecondary: '#b9ccc1',
  textMuted: '#8ba398',
  textFaint: '#5f7a6c',

  // Estados
  danger: '#f87171',
  dangerSoft: 'rgba(248, 113, 113, 0.10)',
  dangerBorder: 'rgba(248, 113, 113, 0.38)',
  warning: '#fbbf24',

  overlay: 'rgba(2, 6, 4, 0.74)',
  shadow: '#000000',
};

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

export const cardShadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.32,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

export const subtleShadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.2,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
