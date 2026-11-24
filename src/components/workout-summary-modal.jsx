import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, radius, spacing } from '../constants/app-theme';
import { formatNumber } from '../utils/format';

function SummaryStat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Confirmación con el resumen de la sesión recién guardada. */
export default function WorkoutSummaryModal({
  visible,
  summary,
  routineName,
  dateLabel,
  onClose,
  onViewHistory,
}) {
  const exerciseCount = summary?.exerciseCount ?? 0;
  const setCount = summary?.setCount ?? 0;
  const volume = summary?.volume ?? 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.checkCircle}>
            <Text style={styles.checkMark}>✓</Text>
          </View>

          <Text style={styles.title}>Entrenamiento guardado</Text>
          <Text style={styles.subtitle}>
            {routineName}
            {dateLabel ? ` · ${dateLabel}` : ''}
          </Text>

          <View style={styles.stats}>
            <SummaryStat label="Ejercicios" value={exerciseCount} />
            <View style={styles.divider} />
            <SummaryStat label="Series" value={setCount} />
            <View style={styles.divider} />
            <SummaryStat label="Volumen" value={`${formatNumber(volume)} kg`} />
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onClose}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Listo</Text>
          </TouchableOpacity>

          {onViewHistory ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onViewHistory}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Ver historial</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.overlay,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  checkCircle: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: spacing.xs,
  },
  checkMark: {
    color: colors.primaryText,
    fontSize: 28,
    fontWeight: '900',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  primaryButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
  },
  primaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    paddingVertical: 8,
  },
  secondaryText: {
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: '700',
  },
});
