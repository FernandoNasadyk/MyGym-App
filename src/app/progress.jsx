import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { getDatabase } from '../db/database';
import {
  PROGRESS_MODES,
  buildProgressMessage,
  getProgressComparison,
} from '../db/progress';
import { radius, spacing } from '../constants/app-theme';
import ScreenHeader from '../components/screen-header';
import { formatDateShort, formatWeight } from '../utils/format';
import { useStyles } from '../components/theme-provider';

const MODE_OPTIONS = [
  { value: PROGRESS_MODES.WEEK, label: 'Vs. semana anterior' },
  { value: PROGRESS_MODES.MONTH, label: 'Vs. mes anterior' },
];

const MAX_EXERCISE_ROWS = 8;

/** Barra horizontal hecha con Views: ratio de 0 a 1. */
function Bar({ ratio, muted = false }) {
  const { styles } = useStyles(createStyles);
  const safe = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  // Un valor mayor que cero siempre deja una marca visible.
  const width = safe > 0 ? Math.max(safe, 0.04) : 0;

  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barFill,
          muted && styles.barFillMuted,
          { width: `${width * 100}%` },
        ]}
      />
    </View>
  );
}

function BarRow({ label, value, ratio, muted, compact = false }) {
  const { styles } = useStyles(createStyles);
  return (
    <View style={styles.barRow}>
      <Text
        style={[styles.barLabel, compact && styles.barLabelCompact]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Bar ratio={ratio} muted={muted} />
      <Text style={[styles.barValue, muted && styles.barValueMuted]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Chip({ text, tone = 'primary' }) {
  const { styles } = useStyles(createStyles);
  return (
    <View style={[styles.chip, tone === 'muted' && styles.chipMuted]}>
      <Text style={[styles.chipText, tone === 'muted' && styles.chipTextMuted]}>
        {text}
      </Text>
    </View>
  );
}

function describeSet(weight, reps, rir) {
  const base = `${formatWeight(weight)} kg × ${reps}`;
  return rir != null ? `${base} · RIR ${rir}` : base;
}

function ExerciseProgressRow({ exercise }) {
  const { styles } = useStyles(createStyles);
  const isUp = exercise.status === 'up';

  // Subió el peso: las barras comparan carga. Mismo peso: comparan repeticiones.
  const before = isUp ? exercise.referenceWeight : exercise.referenceReps;
  const now = isUp ? exercise.weight : exercise.reps;
  const top = Math.max(before, now, 1);

  let chip;
  if (isUp) {
    chip = `+${String(exercise.deltaPct).replace('.', ',')}%`;
  } else if (exercise.reps > exercise.referenceReps) {
    const diff = exercise.reps - exercise.referenceReps;
    chip = `+${diff} ${diff === 1 ? 'rep' : 'reps'}`;
  } else {
    chip = 'Más reserva';
  }

  return (
    <View style={styles.exerciseRow}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseName} numberOfLines={2}>
          {exercise.name}
        </Text>
        <Chip text={chip} />
      </View>
      <BarRow
        compact
        label="Antes"
        muted
        ratio={before / top}
        value={describeSet(
          exercise.referenceWeight,
          exercise.referenceReps,
          exercise.referenceRir
        )}
      />
      <BarRow
        compact
        label="Ahora"
        ratio={now / top}
        value={describeSet(exercise.weight, exercise.reps, exercise.rir)}
      />
      {!isUp ? (
        <Text style={styles.exerciseNote}>
          Mismo peso ({formatWeight(exercise.weight)} kg): mejoró el rendimiento.
        </Text>
      ) : null}
    </View>
  );
}

export default function ProgressScreen() {
  const { styles, colors } = useStyles(createStyles);
  const router = useRouter();

  const [mode, setMode] = useState(PROGRESS_MODES.WEEK);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const modeRef = useRef(PROGRESS_MODES.WEEK);
  const requestRef = useRef(0);

  const load = useCallback(async (nextMode) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    try {
      setErrorMsg(null);
      const db = await getDatabase();
      const data = await getProgressComparison(db, nextMode, new Date());
      if (requestId !== requestRef.current) return;
      setResult(data);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.error('Error cargando el progreso:', err);
      setErrorMsg('No se pudo cargar el progreso.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(modeRef.current);
    }, [load])
  );

  const handleSelectMode = (nextMode) => {
    if (nextMode === modeRef.current) return;
    modeRef.current = nextMode;
    setMode(nextMode);
    load(nextMode);
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const header = (
    <ScreenHeader
      eyebrow="PROGRESO"
      title="Progreso y comparativas"
      subtitle="Tu carga real, no solo el volumen"
      backLabel="Atrás"
      onBack={handleGoBack}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const message = result ? buildProgressMessage(result) : null;
  const improved = result
    ? result.exercises
        .filter((exercise) => exercise.status === 'up' || exercise.status === 'better')
        .slice(0, MAX_EXERCISE_ROWS)
    : [];
  const counts = result?.counts;
  const upPercent =
    counts && counts.comparable > 0
      ? Math.round((counts.up / counts.comparable) * 100)
      : 0;

  const sessionsTop = result
    ? Math.max(result.sessions.current, result.sessions.referencePerWeek, 1)
    : 1;
  const isMonth = mode === PROGRESS_MODES.MONTH;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {header}

        <View style={styles.modeRow}>
          {MODE_OPTIONS.map((option) => {
            const active = mode === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.modeChip, active && styles.modeChipActive]}
                onPress={() => handleSelectMode(option.value)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
              >
                <Text
                  style={[styles.modeText, active && styles.modeTextActive]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {result && message ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroPeriod}>
                {formatDateShort(result.periods.current.start)} –{' '}
                {formatDateShort(result.periods.current.end)} · últimos 7 días
              </Text>
              <Text style={styles.heroTitle}>{message.title}</Text>
              <Text style={styles.heroText}>{message.text}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Subida de carga</Text>
              {counts.comparable > 0 ? (
                <>
                  <View style={styles.percentRow}>
                    <Text style={styles.percentValue}>{upPercent}%</Text>
                    <Text style={styles.percentLabel}>
                      {counts.up} de {counts.comparable}{' '}
                      {counts.comparable === 1
                        ? 'ejercicio subió'
                        : 'ejercicios subieron'}{' '}
                      su peso máximo
                    </Text>
                  </View>
                  <Bar ratio={upPercent / 100} />
                  <View style={styles.chipsRow}>
                    <Chip text={`Subieron ${counts.up}`} />
                    <Chip
                      tone="muted"
                      text={`Igual ${counts.same + counts.better}`}
                    />
                    <Chip tone="muted" text={`Bajaron ${counts.down}`} />
                  </View>
                </>
              ) : (
                <Text style={styles.emptyText}>
                  Todavía no hay ejercicios para comparar. Se verá al registrar
                  más sesiones.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sesiones completadas</Text>
              <BarRow
                label="Últimos 7 días"
                ratio={result.sessions.current / sessionsTop}
                value={String(result.sessions.current)}
              />
              <BarRow
                muted
                label={isMonth ? 'Prom. semanal' : 'Semana anterior'}
                ratio={result.sessions.referencePerWeek / sessionsTop}
                value={String(result.sessions.referencePerWeek).replace('.', ',')}
              />
              {isMonth ? (
                <Text style={styles.cardHint}>
                  El mes anterior son las 4 semanas previas, y se muestra su
                  promedio por semana para comparar parejo.
                </Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Progreso por ejercicio</Text>
              <Text style={styles.cardHint}>
                Peso máximo de cada ejercicio: antes vs. ahora.
              </Text>
              {improved.length > 0 ? (
                improved.map((exercise) => (
                  <ExerciseProgressRow key={exercise.id} exercise={exercise} />
                ))
              ) : (
                <Text style={styles.emptyText}>
                  {result.hasReference
                    ? 'Todavía no hay ejercicios con mejoras en este período. Cuando subas peso o rindas mejor con la misma carga, aparecen acá.'
                    : 'Se verá al registrar más sesiones.'}
                </Text>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    centerBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      padding: spacing.xl,
      paddingBottom: spacing.xxxl,
      gap: spacing.lg,
    },
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    modeChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    modeText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    modeTextActive: {
      color: colors.primaryText,
    },
    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
    },
    heroCard: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      ...colors.cardShadow,
    },
    heroPeriod: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    heroTitle: {
      color: colors.text,
      fontSize: 21,
      fontWeight: '800',
      lineHeight: 27,
    },
    heroText: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
      ...colors.cardShadow,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    cardHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    percentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    percentValue: {
      color: colors.primary,
      fontSize: 34,
      fontWeight: '800',
    },
    percentLabel: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
    },
    chipMuted: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.border,
    },
    chipText: {
      color: colors.primaryText,
      fontSize: 12,
      fontWeight: '800',
    },
    chipTextMuted: {
      color: colors.textMuted,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    barLabel: {
      width: 88,
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    barLabelCompact: {
      width: 44,
    },
    barTrack: {
      flex: 1,
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceHigh,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
    },
    barFillMuted: {
      backgroundColor: colors.borderStrong,
    },
    barValue: {
      minWidth: 64,
      maxWidth: 140,
      textAlign: 'right',
      color: colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    barValueMuted: {
      color: colors.textMuted,
      fontWeight: '700',
    },
    exerciseRow: {
      gap: 6,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    exerciseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    exerciseName: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    exerciseNote: {
      color: colors.textFaint,
      fontSize: 11,
    },
  });
