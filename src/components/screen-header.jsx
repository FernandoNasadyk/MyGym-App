import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius, spacing } from '../constants/app-theme';
import { useStyles } from './theme-provider';

/**
 * Encabezado común de las pantallas internas: botón de volver, etiqueta
 * chica, título grande, subtítulo y un espacio para una acción a la derecha.
 */
export default function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  onBack,
  backLabel = 'Inicio',
  right = null,
}) {
  const { styles } = useStyles(createStyles);
  return (
    <View style={styles.wrapper}>
      {onBack ? (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Volver a ${backLabel}`}
        >
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backText}>{backLabel}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.row}>
        <View style={styles.textColumn}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  wrapper: {
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backArrow: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: '800',
  },
  backText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  right: {
    paddingTop: 6,
  },
});
