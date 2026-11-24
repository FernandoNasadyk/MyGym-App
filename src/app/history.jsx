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
  getExerciseFilterOptions,
  getHistoryTotals,
  getRecentSessions,
} from '../db/history';
import { colors, radius, spacing, cardShadow } from '../constants/app-theme';
import ScreenHeader from '../components/screen-header';
import {
  formatRelativeDate,
  formatVolume,
  formatWeekdayShort,
  formatWeight,
  getDateBadgeParts,
} from '../utils/format';

const PAGE_SIZE = 10;

const EMPTY_TOTALS = { sessions: 0, sets: 0, volume: 0, bestWeight: 0 };

function StatBlock({ label, value }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const router = useRouter();

  const [sessions, setSessions] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [filterOptions, setFilterOptions] = useState([]);
  const [exerciseId, setExerciseId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Para ignorar respuestas viejas si cambiás el filtro rápido.
  const requestRef = useRef(0);
  const exerciseIdRef = useRef(null);
  const sessionsRef = useRef([]);

  const loadFirstPage = useCallback(async (nextExerciseId) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    try {
      setErrorMsg(null);
      const db = await getDatabase();
      const [options, page, summaryTotals] = await Promise.all([
        getExerciseFilterOptions(db),
        getRecentSessions(db, {
          limit: PAGE_SIZE,
          offset: 0,
          exerciseId: nextExerciseId,
        }),
        getHistoryTotals(db, nextExerciseId),
      ]);
      if (requestId !== requestRef.current) return;

      sessionsRef.current = page;
      setFilterOptions(options);
      setSessions(page);
      setTotals(summaryTotals);
      setExpandedId((current) => {
        if (current && page.some((session) => session.id === current)) {
          return current;
        }
        return page[0]?.id ?? null;
      });
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.error('Error cargando historial:', err);
      setErrorMsg('No se pudo cargar el historial de sesiones.');
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage(exerciseIdRef.current);
    }, [loadFirstPage])
  );

  const handleSelectFilter = (nextExerciseId) => {
    if (nextExerciseId === exerciseIdRef.current) return;
    exerciseIdRef.current = nextExerciseId;
    setExerciseId(nextExerciseId);
    setExpandedId(null);
    setRefreshing(true);
    loadFirstPage(nextExerciseId);
  };

  const handleLoadMore = async () => {
    if (loadingMore) return;

    try {
      setLoadingMore(true);
      const db = await getDatabase();
      const requestId = requestRef.current;
      const page = await getRecentSessions(db, {
        limit: PAGE_SIZE,
        offset: sessionsRef.current.length,
        exerciseId: exerciseIdRef.current,
      });
      // Si mientras tanto cambió el filtro, descartamos esta página.
      if (requestId !== requestRef.current) return;

      const known = new Set(sessionsRef.current.map((session) => session.id));
      const next = [
        ...sessionsRef.current,
        ...page.filter((session) => !known.has(session.id)),
      ];
      sessionsRef.current = next;
      setSessions(next);
    } catch (err) {
      console.error('Error cargando más sesiones:', err);
      setErrorMsg('No se pudieron cargar más sesiones.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const toggleSession = (sessionId) => {
    setExpandedId((current) => (current === sessionId ? null : sessionId));
  };

  const selectedExercise =
    filterOptions.find((option) => option.id === exerciseId) || null;
  const hasMore = sessions.length < totals.sessions;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.helperText}>Cargando historial...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow="TU PROGRESO"
          title="Historial"
          subtitle={
            selectedExercise
              ? `Todas tus series de ${selectedExercise.name}.`
              : 'Todas tus sesiones, con los pesos y las reps de cada serie.'
          }
          backLabel="Inicio"
          onBack={handleGoBack}
        />

        {filterOptions.length > 0 ? (
          <>
            <Text style={styles.filterLabel}>Filtrar por ejercicio</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  exerciseId === null && styles.filterChipActive,
                ]}
                onPress={() => handleSelectFilter(null)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: exerciseId === null }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    exerciseId === null && styles.filterChipTextActive,
                  ]}
                >
                  Todos
                </Text>
              </TouchableOpacity>

              {filterOptions.map((option) => {
                const active = exerciseId === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => handleSelectFilter(option.id)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {option.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {errorMsg ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                loadFirstPage(exerciseIdRef.current);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : refreshing ? (
          <View style={styles.refreshingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Todavía no hay sesiones</Text>
            <Text style={styles.emptyText}>
              Cuando finalices un entrenamiento, la sesión aparece acá con el
              detalle de cada ejercicio.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleGoBack}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Ir a entrenar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <StatBlock label="Sesiones" value={totals.sessions} />
              <View style={styles.summaryDivider} />
              <StatBlock label="Series" value={totals.sets} />
              <View style={styles.summaryDivider} />
              <StatBlock label="Volumen" value={formatVolume(totals.volume)} />
              {selectedExercise ? (
                <>
                  <View style={styles.summaryDivider} />
                  <StatBlock
                    label="Mejor peso"
                    value={`${formatWeight(totals.bestWeight)} kg`}
                  />
                </>
              ) : null}
            </View>

            <View style={styles.listHeader}>
              <Text style={styles.sectionLabel}>Sesiones</Text>
              <Text style={styles.listHint}>
                {sessions.length} de {totals.sessions} · tocá una para ver el
                detalle
              </Text>
            </View>

            <View style={styles.list}>
              {sessions.map((session) => {
                const expanded = expandedId === session.id;
                const badge = getDateBadgeParts(session.date);
                const exerciseCount = session.exercises.length;

                return (
                  <View key={session.id} style={styles.sessionCard}>
                    <TouchableOpacity
                      style={styles.sessionHeader}
                      onPress={() => toggleSession(session.id)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Sesión de ${session.routineName}, ${formatRelativeDate(
                        session.date
                      )}`}
                    >
                      <View style={styles.dateBadge}>
                        <Text style={styles.dateWeekday}>
                          {formatWeekdayShort(session.date).toUpperCase()}
                        </Text>
                        <Text style={styles.dateDay}>{badge.day}</Text>
                        <Text style={styles.dateMonth}>{badge.month}</Text>
                      </View>

                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionRoutine}>
                          {session.routineName}
                        </Text>
                        <Text style={styles.sessionMeta}>
                          {formatRelativeDate(session.date)} · {exerciseCount}{' '}
                          {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'} ·{' '}
                          {session.setCount}{' '}
                          {session.setCount === 1 ? 'serie' : 'series'}
                        </Text>
                        <Text style={styles.sessionVolume}>
                          {formatVolume(session.volume)} de volumen
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.chevron,
                          expanded && styles.chevronOpen,
                        ]}
                      >
                        ▾
                      </Text>
                    </TouchableOpacity>

                    {expanded && (
                      <View style={styles.sessionBody}>
                        {session.exercises.map((exercise) => (
                          <View
                            key={`${session.id}-${exercise.id}`}
                            style={styles.exerciseBlock}
                          >
                            <View style={styles.exerciseHeader}>
                              <Text
                                style={styles.exerciseName}
                                numberOfLines={2}
                              >
                                {exercise.name}
                              </Text>
                              <Text style={styles.exerciseMeta}>
                                {formatVolume(exercise.volume)}
                              </Text>
                            </View>

                            <View style={styles.setsRow}>
                              {exercise.sets.map((set) => (
                                <View
                                  key={set.setNumber}
                                  style={styles.setChip}
                                >
                                  <Text style={styles.setIndex}>
                                    {set.setNumber}
                                  </Text>
                                  <Text style={styles.setValue}>
                                    {formatWeight(set.weight)} kg
                                  </Text>
                                  <Text style={styles.setReps}>
                                    × {set.reps}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {hasMore ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={handleLoadMore}
                disabled={loadingMore}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Cargar más sesiones"
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>Cargar más sesiones</Text>
                )}
              </TouchableOpacity>
            ) : (
              <Text style={styles.footnote}>
                Llegaste al principio de tu historial.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  helperText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  retryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
    ...cardShadow,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    marginTop: spacing.sm,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    ...cardShadow,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
  },
  statValue: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  listHint: {
    color: colors.textFaint,
    fontSize: 11,
  },
  list: {
    gap: spacing.md,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...cardShadow,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  dateBadge: {
    width: 54,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: 1,
  },
  dateWeekday: {
    color: colors.primaryText,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  dateDay: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  dateMonth: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sessionInfo: {
    flex: 1,
    gap: 3,
  },
  sessionRoutine: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sessionMeta: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
  },
  sessionVolume: {
    color: colors.primaryText,
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textFaint,
    fontSize: 14,
    fontWeight: '800',
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    color: colors.primary,
    transform: [{ rotate: '180deg' }],
  },
  sessionBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.bgSoft,
  },
  exerciseBlock: {
    gap: spacing.sm,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  exerciseName: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  exerciseMeta: {
    color: colors.textFaint,
    fontSize: 10.5,
    fontWeight: '700',
  },
  setsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  setChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setIndex: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '800',
    minWidth: 9,
    textAlign: 'center',
  },
  setValue: {
    color: colors.text,
    fontSize: 11.5,
    fontWeight: '700',
  },
  setReps: {
    color: colors.primaryText,
    fontSize: 11.5,
    fontWeight: '800',
  },
  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.xl,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: colors.primaryText,
  },
  filterLabel: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: -4,
  },
  refreshingBox: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  loadMoreText: {
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
