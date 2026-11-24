import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { getDatabase } from '../db/database';
import { getRoutines, getTodayRoutine } from '../db/routines';
import {
  getProgressionSuggestions,
  getWorkoutData,
  saveWorkout,
} from '../db/workout';
import { getDayLabel, getTodayCode } from '../constants/weekdays';
import { colors, radius, spacing, cardShadow } from '../constants/app-theme';
import { RIR_OPTIONS, WEIGHT_STEP } from '../constants/training';
import SettingsDrawer from '../components/settings-drawer';
import ProgressBar from '../components/progress-bar';
import WorkoutSummaryModal from '../components/workout-summary-modal';
import {
  formatTodayLong,
  formatWeight,
  toISODate,
  formatDateShort,
} from '../utils/format';
import { parseWarmupSteps } from '../utils/warmup';
import {
  addSet,
  adjustWeight,
  buildInitialCollapsed,
  buildInitialDrafts,
  buildInitialRir,
  buildWorkoutEntries,
  countCompleted,
  describeLastSets,
  isExerciseComplete,
  isSetFilled,
  isWorkoutComplete,
  removeLastSet,
  sanitizeRepsInput,
  sanitizeWeightInput,
} from '../utils/workout-draft';

function ExerciseCard({
  exercise,
  index,
  sets,
  lastSets,
  suggestion,
  rir,
  collapsed,
  onToggle,
  onChangeSet,
  onStepWeight,
  onAddSet,
  onRemoveSet,
  onApplySuggestion,
  onChangeRir,
}) {
  const complete = isExerciseComplete(sets);
  const filled = sets.filter(isSetFilled).length;
  const lastText = describeLastSets(lastSets, formatWeight);

  return (
    <View style={[styles.exerciseCard, complete && styles.exerciseCardDone]}>
      <TouchableOpacity
        style={styles.exerciseHeader}
        onPress={onToggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}, ${filled} de ${sets.length} series`}
      >
        <View style={[styles.positionBadge, complete && styles.positionBadgeDone]}>
          <Text style={[styles.positionText, complete && styles.positionTextDone]}>
            {complete ? '✓' : index + 1}
          </Text>
        </View>

        <View style={styles.exerciseTitleBox}>
          <Text style={styles.exerciseName} numberOfLines={2}>
            {exercise.name}
          </Text>
          <Text style={styles.exerciseMeta}>
            {filled}/{sets.length} series · objetivo {exercise.min_reps}–
            {exercise.max_reps} reps
          </Text>
        </View>

        <Text style={styles.collapseGlyph}>{collapsed ? '▸' : '▾'}</Text>
      </TouchableOpacity>

      {collapsed ? null : (
        <View style={styles.exerciseBody}>
          {lastText ? (
            <View style={styles.lastRow}>
              <Text style={styles.lastLabel}>Última vez</Text>
              <Text style={styles.lastValue} numberOfLines={1}>
                {lastText}
              </Text>
            </View>
          ) : null}

          {suggestion != null ? (
            <View style={styles.suggestionBox}>
              <View style={styles.suggestionText}>
                <Text style={styles.suggestionTitle}>Subí el peso</Text>
                <Text style={styles.suggestionHint}>
                  Llegaste al máximo de reps: probá con {formatWeight(suggestion)}{' '}
                  kg.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.suggestionButton}
                onPress={onApplySuggestion}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Usar ${formatWeight(suggestion)} kilos`}
              >
                <Text style={styles.suggestionButtonText}>Usar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {sets.map((set, setIndex) => {
            const done = isSetFilled(set);
            return (
              <View key={setIndex} style={styles.setRow}>
                <View style={[styles.setIndex, done && styles.setIndexDone]}>
                  <Text
                    style={[styles.setIndexText, done && styles.setIndexTextDone]}
                  >
                    {setIndex + 1}
                  </Text>
                </View>

                <View style={styles.weightGroup}>
                  <TouchableOpacity
                    style={styles.stepButton}
                    onPress={() => onStepWeight(setIndex, 'down')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Bajar peso de la serie ${setIndex + 1}`}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </TouchableOpacity>

                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      value={set.weight}
                      onChangeText={(value) =>
                        onChangeSet(setIndex, 'weight', sanitizeWeightInput(value))
                      }
                      selectTextOnFocus
                      accessibilityLabel={`Kilos de la serie ${setIndex + 1}`}
                    />
                    <Text style={styles.inputUnit}>kg</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.stepButton}
                    onPress={() => onStepWeight(setIndex, 'up')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Subir peso de la serie ${setIndex + 1}`}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.inputWrap, styles.repsWrap]}>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    placeholder={`${exercise.min_reps}-${exercise.max_reps}`}
                    placeholderTextColor={colors.textFaint}
                    value={set.reps}
                    onChangeText={(value) =>
                      onChangeSet(setIndex, 'reps', sanitizeRepsInput(value))
                    }
                    selectTextOnFocus
                    accessibilityLabel={`Repeticiones de la serie ${setIndex + 1}`}
                  />
                  <Text style={styles.inputUnit}>reps</Text>
                </View>
              </View>
            );
          })}

          <View style={styles.setActions}>
            <TouchableOpacity
              style={styles.setActionButton}
              onPress={onAddSet}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.setActionText}>+ Serie</Text>
            </TouchableOpacity>
            {sets.length > 1 ? (
              <TouchableOpacity
                style={styles.setActionButton}
                onPress={onRemoveSet}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.setActionMuted}>− Quitar última</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.rirBlock}>
            <View style={styles.rirHeader}>
              <Text style={styles.rirLabel}>RIR</Text>
              <Text style={styles.rirHint}>
                Repeticiones en reserva (opcional)
              </Text>
            </View>
            <View style={styles.rirChips}>
              {[null, ...RIR_OPTIONS].map((option) => {
                const active = (rir ?? null) === option;
                const label = option === null ? 'Sin RIR' : `RIR ${option}`;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.rirChip, active && styles.rirChipActive]}
                    onPress={() => onChangeRir(option)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={
                      option === null
                        ? `${exercise.name}: sin RIR`
                        : `${exercise.name}: RIR ${option}`
                    }
                  >
                    <Text
                      style={[
                        styles.rirChipText,
                        active && styles.rirChipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export default function IndexScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const [routines, setRoutines] = useState([]);
  const [todayRoutine, setTodayRoutine] = useState(null);
  const [activeRoutine, setActiveRoutine] = useState(null);
  const [workout, setWorkout] = useState({
    exercises: [],
    lastLogs: new Map(),
    session: null,
  });
  const [drafts, setDrafts] = useState({});
  const [suggestions, setSuggestions] = useState(() => new Map());
  const [rirByExercise, setRirByExercise] = useState({});
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [warmupOpen, setWarmupOpen] = useState(true);

  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [progressionWeeks, setProgressionWeeks] = useState(2);
  const [savingSetting, setSavingSetting] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);
  const [sessionsCount, setSessionsCount] = useState(0);

  // Datos que las cargas necesitan sin volver a crear el callback.
  const chosenRoutineIdRef = useRef(null);
  const loadedKeyRef = useRef(null);
  const loadedDateRef = useRef(toISODate());
  const draftsRef = useRef({});
  const rirRef = useRef({});

  const updateDrafts = useCallback((updater) => {
    setDrafts((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      draftsRef.current = next;
      return next;
    });
  }, []);

  const updateRir = useCallback((updater) => {
    setRirByExercise((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      rirRef.current = next;
      return next;
    });
  }, []);

  const loadData = useCallback(
    async ({ reset = false } = {}) => {
      try {
        setErrorMsg(null);
        const db = await getDatabase();
        const date = toISODate();

        const settings = await db.getFirstAsync(
          'SELECT progression_weeks FROM app_settings WHERE id = 1;'
        );
        const weeks = settings?.progression_weeks === 1 ? 1 : 2;
        setProgressionWeeks(weeks);

        const [allRoutines, today] = await Promise.all([
          getRoutines(db),
          getTodayRoutine(db),
        ]);
        setRoutines(allRoutines);
        setTodayRoutine(today);

        const chosen = chosenRoutineIdRef.current
          ? allRoutines.find((item) => item.id === chosenRoutineIdRef.current)
          : null;
        if (chosenRoutineIdRef.current && !chosen) {
          chosenRoutineIdRef.current = null;
        }
        const active = chosen || today || null;
        setActiveRoutine(active);

        const catalogRow = await db.getFirstAsync(
          'SELECT COUNT(*) AS total FROM exercises WHERE is_active = 1;'
        );
        setCatalogCount(Number(catalogRow?.total) || 0);

        const sessionRow = await db.getFirstAsync(
          `SELECT COUNT(*) AS total FROM workout_sessions ws
           WHERE EXISTS (SELECT 1 FROM set_logs sl WHERE sl.session_id = ws.id);`
        );
        setSessionsCount(Number(sessionRow?.total) || 0);

        if (!active) {
          loadedKeyRef.current = null;
          setWorkout({ exercises: [], lastLogs: new Map(), session: null });
          updateDrafts({});
          updateRir({});
          setSuggestions(new Map());
          return;
        }

        const data = await getWorkoutData(db, active.id, date);
        const suggested = await getProgressionSuggestions(
          db,
          data.exercises,
          weeks
        );

        const key = `${active.id}:${date}`;
        const sameWorkout = loadedKeyRef.current === key;
        loadedKeyRef.current = key;
        loadedDateRef.current = date;

        setWorkout({
          exercises: data.exercises,
          lastLogs: data.lastLogs,
          session: data.session,
        });
        setSuggestions(suggested);

        // Al volver de otra pantalla no pisamos lo que ya cargaste hoy.
        const fresh = buildInitialDrafts(
          data.exercises,
          data.lastLogs,
          data.savedLogs
        );
        const freshRir = buildInitialRir(data.exercises, data.savedLogs);
        if (reset || !sameWorkout) {
          updateDrafts(fresh);
          updateRir(freshRir);
          // Al cargar el día: calentamiento y primer ejercicio abiertos, el
          // resto de los ejercicios contraídos.
          setCollapsed(buildInitialCollapsed(data.exercises));
          setWarmupOpen(true);
        } else {
          const previous = draftsRef.current;
          const previousRir = rirRef.current;
          const merged = {};
          const mergedRir = {};
          const newlyAdded = [];
          data.exercises.forEach((exercise, position) => {
            if (!previous[exercise.id] && position > 0) {
              newlyAdded.push(exercise.id);
            }
            merged[exercise.id] = previous[exercise.id] || fresh[exercise.id];
            mergedRir[exercise.id] =
              exercise.id in previousRir
                ? previousRir[exercise.id]
                : freshRir[exercise.id];
          });
          updateDrafts(merged);
          updateRir(mergedRir);
          // Un ejercicio sumado mientras estabas en otra pantalla entra contraído.
          if (newlyAdded.length > 0) {
            setCollapsed((current) => new Set([...current, ...newlyAdded]));
          }
        }
      } catch (err) {
        console.error('Error cargando el entrenamiento de hoy:', err);
        setErrorMsg('No se pudieron cargar los datos desde SQLite.');
      } finally {
        setLoading(false);
      }
    },
    [updateDrafts, updateRir]
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleChangeSet = (exerciseId, setIndex, field, value) => {
    setStatusMsg(null);
    updateDrafts((previous) => ({
      ...previous,
      [exerciseId]: previous[exerciseId].map((set, index) =>
        index === setIndex ? { ...set, [field]: value } : set
      ),
    }));
  };

  const handleStepWeight = (exercise, setIndex, direction) => {
    updateDrafts((previous) => ({
      ...previous,
      [exercise.id]: previous[exercise.id].map((set, index) =>
        index === setIndex
          ? {
              ...set,
              weight: adjustWeight(set.weight, WEIGHT_STEP, direction),
            }
          : set
      ),
    }));
  };

  const handleAddSet = (exerciseId) => {
    updateDrafts((previous) => ({
      ...previous,
      [exerciseId]: addSet(previous[exerciseId]),
    }));
  };

  const handleRemoveSet = (exerciseId) => {
    updateDrafts((previous) => ({
      ...previous,
      [exerciseId]: removeLastSet(previous[exerciseId]),
    }));
  };

  const handleApplySuggestion = (exerciseId, weight) => {
    updateDrafts((previous) => ({
      ...previous,
      [exerciseId]: previous[exerciseId].map((set) => ({
        ...set,
        weight: String(weight),
      })),
    }));
  };

  const handleChangeRir = (exerciseId, value) => {
    setStatusMsg(null);
    updateRir((previous) => ({ ...previous, [exerciseId]: value }));
  };

  const toggleCollapsed = (exerciseId) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  };

  const chooseRoutine = (routine) => {
    chosenRoutineIdRef.current = routine ? routine.id : null;
    setStatusMsg(null);
    setLoading(true);
    loadData({ reset: true });
  };

  const handleFinish = async () => {
    if (saving || !activeRoutine) return;

    try {
      setSaving(true);
      setStatusMsg(null);
      const db = await getDatabase();
      const result = await saveWorkout(db, {
        routineId: activeRoutine.id,
        date: loadedDateRef.current,
        entries: buildWorkoutEntries(
          workout.exercises,
          draftsRef.current,
          rirRef.current
        ),
      });
      setSummary(result);
    } catch (err) {
      console.error('Error guardando el entrenamiento:', err);
      setStatusMsg(err?.message || 'No se pudo guardar el entrenamiento.');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseSummary = () => {
    setSummary(null);
    loadData({ reset: true });
  };

  const handleViewHistory = () => {
    setSummary(null);
    loadData({ reset: true });
    router.push('/history');
  };

  const handleChangeWeeks = async (weeks) => {
    try {
      setSavingSetting(true);
      setProgressionWeeks(weeks);
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE app_settings SET progression_weeks = ? WHERE id = 1;',
        [weeks]
      );
      await loadData();
    } catch (err) {
      console.error('Error guardando semanas:', err);
    } finally {
      setSavingSetting(false);
    }
  };

  const exercises = workout.exercises;
  const completed = countCompleted(exercises, drafts);
  const allDone = isWorkoutComplete(exercises, drafts);
  const progress = exercises.length > 0 ? completed / exercises.length : 0;
  const alreadySaved = Boolean(workout.session);
  const isTodayRoutine = Boolean(
    activeRoutine && todayRoutine && activeRoutine.id === todayRoutine.id
  );
  const warmupSteps = parseWarmupSteps(activeRoutine?.warmup);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.helperText}>Preparando tu entrenamiento...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMsg) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>Algo salió mal</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              loadData({ reset: true });
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.brandRow}>
      <View style={styles.brandText}>
        <Text style={styles.brandEyebrow}>MY GYM</Text>
        <Text style={styles.brandTitle}>
          {activeRoutine ? 'Entrená hoy' : 'Hoy'}
        </Text>
        <Text style={styles.brandDate}>{formatTodayLong()}</Text>
      </View>

      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => setDrawerOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Abrir ajustes"
      >
        <Text style={styles.menuGlyph}>☰</Text>
      </TouchableOpacity>
    </View>
  );

  let content;

  if (routines.length === 0) {
    content = (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Armá tu primera rutina</Text>
        <Text style={styles.emptyText}>
          Todavía no tenés días cargados. Creá uno, elegí qué día de la semana
          es y sumale ejercicios.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/routines')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Ir a Rutinas</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!activeRoutine) {
    content = (
      <>
        <View style={styles.restCard}>
          <Text style={styles.restGlyph}>☾</Text>
          <Text style={styles.restTitle}>Hoy toca descansar</Text>
          <Text style={styles.restText}>
            No tenés una rutina asignada para el{' '}
            {getDayLabel(getTodayCode()).toLowerCase()}. Si igual querés
            entrenar, elegí uno de tus días.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Entrenar igual</Text>
          <Text style={styles.sectionHint}>Elegí un día</Text>
        </View>

        {routines.map((routine) => (
          <TouchableOpacity
            key={routine.id}
            style={styles.pickRow}
            onPress={() => chooseRoutine(routine)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Entrenar ${routine.name}`}
          >
            <View style={styles.pickInfo}>
              <Text style={styles.pickName}>{routine.name}</Text>
              <Text style={styles.pickMeta}>
                {getDayLabel(routine.day_code)} · {routine.exercise_count}{' '}
                {routine.exercise_count === 1 ? 'ejercicio' : 'ejercicios'}
                {routine.last_session_date
                  ? ` · última ${formatDateShort(routine.last_session_date)}`
                  : ''}
              </Text>
            </View>
            <Text style={styles.pickArrow}>→</Text>
          </TouchableOpacity>
        ))}
      </>
    );
  } else {
    content = (
      <>
        <View style={styles.todayCard}>
          <View style={styles.todayTop}>
            <View style={styles.todayInfo}>
              <View style={styles.todayLabelRow}>
                <Text style={styles.todayLabel}>
                  {isTodayRoutine ? 'RUTINA DE HOY' : 'ENTRENAMIENTO LIBRE'}
                </Text>
                {activeRoutine.is_extra === 1 ? (
                  <View style={styles.extraBadge}>
                    <Text style={styles.extraBadgeText}>EXTRA</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.todayName} numberOfLines={2}>
                {activeRoutine.name}
              </Text>
            </View>

            <View style={styles.todayCount}>
              <Text style={styles.todayCountValue}>
                {completed}/{exercises.length}
              </Text>
              <Text style={styles.todayCountLabel}>ejercicios</Text>
            </View>
          </View>

          <ProgressBar progress={progress} height={8} />

          {!isTodayRoutine ? (
            <TouchableOpacity
              style={styles.backToday}
              onPress={() => chooseRoutine(null)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.backTodayText}>
                {todayRoutine ? '← Volver a la rutina de hoy' : '← Volver'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {alreadySaved ? (
          <View style={styles.savedBanner}>
            <Text style={styles.savedTitle}>Ya guardaste este entrenamiento</Text>
            <Text style={styles.savedText}>
              Podés corregir algo y volver a finalizar para actualizarlo.
            </Text>
          </View>
        ) : null}

        {warmupSteps.length > 0 ? (
          <View style={styles.warmupCard}>
            <TouchableOpacity
              style={styles.warmupHeader}
              onPress={() => setWarmupOpen((open) => !open)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Mostrar u ocultar calentamiento"
            >
              <Text style={styles.warmupTitle}>Calentamiento</Text>
              <Text style={styles.collapseGlyph}>{warmupOpen ? '▾' : '▸'}</Text>
            </TouchableOpacity>

            {warmupOpen
              ? warmupSteps.map((step, index) => (
                  <View key={`${index}-${step}`} style={styles.warmupStepRow}>
                    <Text style={styles.warmupBullet}>{index + 1}.</Text>
                    <Text style={styles.warmupStepText}>{step}</Text>
                  </View>
                ))
              : null}
          </View>
        ) : null}

        {exercises.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Este día no tiene ejercicios</Text>
            <Text style={styles.emptyText}>
              Sumale ejercicios desde Rutinas y después volvé acá para
              entrenar.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() =>
                router.push({
                  pathname: '/routine',
                  params: {
                    routineId: String(activeRoutine.id),
                    routineName: activeRoutine.name,
                  },
                })
              }
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Agregar ejercicios</Text>
            </TouchableOpacity>
          </View>
        ) : (
          exercises.map((exercise, index) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              index={index}
              sets={drafts[exercise.id] || []}
              lastSets={workout.lastLogs.get(exercise.id)}
              suggestion={suggestions.get(Number(exercise.id)) ?? null}
              rir={rirByExercise[exercise.id] ?? null}
              collapsed={collapsed.has(exercise.id)}
              onToggle={() => toggleCollapsed(exercise.id)}
              onChangeSet={(setIndex, field, value) =>
                handleChangeSet(exercise.id, setIndex, field, value)
              }
              onStepWeight={(setIndex, direction) =>
                handleStepWeight(exercise, setIndex, direction)
              }
              onAddSet={() => handleAddSet(exercise.id)}
              onRemoveSet={() => handleRemoveSet(exercise.id)}
              onChangeRir={(value) => handleChangeRir(exercise.id, value)}
              onApplySuggestion={() =>
                handleApplySuggestion(
                  exercise.id,
                  suggestions.get(Number(exercise.id))
                )
              }
            />
          ))
        )}

        {exercises.length > 0 && !allDone ? (
          <Text style={styles.footnote}>
            Completá las repeticiones de todas las series para finalizar el
            entrenamiento.
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            allDone && styles.scrollContentWithBar,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {header}

          {statusMsg ? (
            <View style={styles.statusBox}>
              <Text style={styles.statusText}>{statusMsg}</Text>
            </View>
          ) : null}

          {content}
        </ScrollView>

        {allDone ? (
          <View style={styles.finishBar}>
            <TouchableOpacity
              style={[styles.finishButton, saving && styles.finishButtonBusy]}
              onPress={handleFinish}
              disabled={saving}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Finalizar entrenamiento de hoy"
            >
              {saving ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.finishText}>
                  {alreadySaved
                    ? 'Actualizar entrenamiento'
                    : 'Finalizar entrenamiento de hoy'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <SettingsDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        progressionWeeks={progressionWeeks}
        saving={savingSetting}
        onChangeWeeks={handleChangeWeeks}
        catalogCount={catalogCount}
        sessionsCount={sessionsCount}
        routinesCount={routines.length}
        onNavigate={(path) => router.push(path)}
      />

      <WorkoutSummaryModal
        visible={Boolean(summary)}
        summary={summary}
        routineName={activeRoutine?.name || ''}
        dateLabel={formatTodayLong()}
        onClose={handleCloseSummary}
        onViewHistory={handleViewHistory}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  scrollContentWithBar: {
    paddingBottom: 120,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  brandText: {
    flex: 1,
  },
  brandEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 2,
  },
  brandDate: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  menuGlyph: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
  },
  statusBox: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  todayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: spacing.lg,
    gap: spacing.md,
    ...cardShadow,
  },
  todayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  todayInfo: {
    flex: 1,
    gap: 4,
  },
  todayLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayLabel: {
    color: colors.primaryText,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  extraBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  extraBadgeText: {
    color: colors.primaryText,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  todayName: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  todayCount: {
    alignItems: 'center',
    minWidth: 64,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  todayCountValue: {
    color: colors.primaryText,
    fontSize: 18,
    fontWeight: '800',
  },
  todayCountLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  backToday: {
    alignSelf: 'flex-start',
  },
  backTodayText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '700',
  },
  savedBanner: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  savedTitle: {
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  savedText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  warmupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  warmupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  warmupTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  warmupStepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  warmupBullet: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    width: 18,
  },
  warmupStepText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...cardShadow,
  },
  exerciseCardDone: {
    borderColor: colors.primaryBorder,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  positionBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  positionBadgeDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  positionText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  positionTextDone: {
    color: colors.bg,
  },
  exerciseTitleBox: {
    flex: 1,
    gap: 2,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: 11.5,
  },
  collapseGlyph: {
    color: colors.textMuted,
    fontSize: 14,
  },
  exerciseBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  lastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lastLabel: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  lastValue: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  suggestionText: {
    flex: 1,
    gap: 2,
  },
  suggestionTitle: {
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  suggestionHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  suggestionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryStrong,
  },
  suggestionButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setIndex: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setIndexDone: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  setIndexText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  setIndexTextDone: {
    color: colors.primaryText,
  },
  weightGroup: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepButton: {
    width: 32,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepText: {
    color: colors.primaryText,
    fontSize: 18,
    fontWeight: '800',
    marginTop: -2,
  },
  inputWrap: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
  },
  repsWrap: {
    flex: 0.9,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 0,
    textAlign: 'center',
  },
  inputUnit: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
  },
  setActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  setActionButton: {
    paddingVertical: 6,
  },
  setActionText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '800',
  },
  setActionMuted: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  rirBlock: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rirHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  rirLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  rirHint: {
    flex: 1,
    color: colors.textFaint,
    fontSize: 11,
  },
  rirChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rirChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rirChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  rirChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  rirChipTextActive: {
    color: colors.primaryText,
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  finishBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  finishButton: {
    minHeight: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryStrong,
    ...cardShadow,
  },
  finishButtonBusy: {
    opacity: 0.7,
  },
  finishText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  restCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    gap: spacing.sm,
    ...cardShadow,
  },
  restGlyph: {
    color: colors.primaryText,
    fontSize: 34,
  },
  restTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  restText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionHint: {
    color: colors.textFaint,
    fontSize: 11,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pickInfo: {
    flex: 1,
    gap: 3,
  },
  pickName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  pickMeta: {
    color: colors.textMuted,
    fontSize: 11.5,
  },
  pickArrow: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  helperText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontSize: 14,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  retryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
});
