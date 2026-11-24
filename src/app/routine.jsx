import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getDatabase } from '../db/database';
import {
  appendExerciseToDay,
  getDayExercises,
  getExercisesOutsideDay,
  moveExerciseInDay,
  removeExerciseFromDay,
  updateExercise,
} from '../db/day-exercises';
import { getRoutineById, updateRoutine } from '../db/routines';
import { getDayLabel } from '../constants/weekdays';
import { cardShadow, colors, radius, spacing } from '../constants/app-theme';
import ScreenHeader from '../components/screen-header';
import ExerciseEditorModal from '../components/exercise-editor-modal';
import ConfirmDialog from '../components/confirm-dialog';
import RoutineFormModal from '../components/routine-form-modal';
import { parseWarmupSteps } from '../utils/warmup';
import { formatInitialWeight } from '../utils/format';

export default function RoutineEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const routineId =
    Number(Array.isArray(params.routineId) ? params.routineId[0] : params.routineId) ||
    1;
  const fallbackName =
    (Array.isArray(params.routineName)
      ? params.routineName[0]
      : params.routineName) || 'Día';

  const [routine, setRoutine] = useState(null);
  const [warmupText, setWarmupText] = useState('');
  const [warmupDraft, setWarmupDraft] = useState('');
  const [editingWarmup, setEditingWarmup] = useState(false);

  const [dayExercises, setDayExercises] = useState([]);
  const [availableCatalog, setAvailableCatalog] = useState([]);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);

  const [editingExercise, setEditingExercise] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [dayFormVisible, setDayFormVisible] = useState(false);

  const busyRef = useRef(false);
  const editingWarmupRef = useRef(false);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/routines');
    }
  };

  const refreshLists = useCallback(async (db) => {
    const assigned = await getDayExercises(db, routineId);
    const outside = await getExercisesOutsideDay(db, routineId);
    setDayExercises(assigned);
    setAvailableCatalog(outside);
    return assigned;
  }, [routineId]);

  const loadDay = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();

      const routineRow = await getRoutineById(db, routineId);
      if (!routineRow) {
        setStatusMsg('Ese día ya no existe.');
        return;
      }

      setRoutine(routineRow);
      const currentWarmup = routineRow.warmup || '';
      if (!editingWarmupRef.current) {
        setWarmupText(currentWarmup);
        setWarmupDraft(currentWarmup);
      }

      await refreshLists(db);
    } catch (err) {
      console.error('Error cargando el día:', err);
      setStatusMsg('No se pudieron cargar los datos del día.');
    } finally {
      setLoading(false);
    }
  }, [routineId, refreshLists]);

  useFocusEffect(
    useCallback(() => {
      loadDay();
    }, [loadDay])
  );

  const handleSaveWarmup = async () => {
    try {
      const cleanWarmup = warmupDraft.trim();
      const db = await getDatabase();
      await db.runAsync('UPDATE routines SET warmup = ? WHERE id = ?;', [
        cleanWarmup,
        routineId,
      ]);
      setWarmupText(cleanWarmup);
      editingWarmupRef.current = false;
      setEditingWarmup(false);
      setStatusMsg('Calentamiento actualizado.');
    } catch (err) {
      console.error('Error guardando calentamiento:', err);
      setStatusMsg('No se pudo guardar el calentamiento.');
    }
  };

  const handleAssignFromCatalog = async (exercise) => {
    if (busyRef.current) return;
    try {
      busyRef.current = true;
      setStatusMsg(null);
      const db = await getDatabase();
      const position = await appendExerciseToDay(db, routineId, exercise.id);

      if (position === null) {
        setStatusMsg(`"${exercise.name}" ya estaba en este día.`);
        await refreshLists(db);
        return;
      }

      setShowCatalogPicker(false);
      await refreshLists(db);
      setStatusMsg(`"${exercise.name}" agregado al final (posición ${position}).`);
    } catch (err) {
      console.error('Error agregando ejercicio:', err);
      setStatusMsg('No se pudo agregar el ejercicio al día.');
    } finally {
      busyRef.current = false;
    }
  };

  const handleMoveExercise = async (exercise, direction) => {
    if (busyRef.current) return;

    const index = dayExercises.findIndex((item) => item.id === exercise.id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= dayExercises.length) return;

    const previous = dayExercises;
    const reordered = dayExercises.slice();
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setDayExercises(reordered);
    setStatusMsg(null);

    try {
      busyRef.current = true;
      const db = await getDatabase();
      const moved = await moveExerciseInDay(db, routineId, exercise.id, direction);
      if (!moved) await refreshLists(db);
    } catch (err) {
      console.error('Error moviendo ejercicio:', err);
      setDayExercises(previous);
      setStatusMsg('No se pudo cambiar el orden.');
    } finally {
      busyRef.current = false;
    }
  };

  const handleConfirmRemoval = async () => {
    const exercise = pendingRemoval;
    setPendingRemoval(null);
    if (!exercise) return;

    try {
      busyRef.current = true;
      const db = await getDatabase();
      await removeExerciseFromDay(db, routineId, exercise.id);
      await refreshLists(db);
      setStatusMsg(`"${exercise.name}" salió del día.`);
    } catch (err) {
      console.error('Error quitando ejercicio:', err);
      setStatusMsg('No se pudo quitar el ejercicio del día.');
    } finally {
      busyRef.current = false;
    }
  };

  const handleSaveExerciseEdit = async (data) => {
    const exercise = editingExercise;
    if (!exercise) return;

    const db = await getDatabase();
    await updateExercise(db, exercise.id, data);
    setEditingExercise(null);
    await refreshLists(db);
    setStatusMsg(`"${data.name}" actualizado.`);
  };

  const handleSaveRoutineData = async (data) => {
    const db = await getDatabase();
    await updateRoutine(db, routineId, data);
    setDayFormVisible(false);
    await loadDay();
    setStatusMsg(`Día actualizado: ${data.name.trim()}.`);
  };

  const warmupSteps = parseWarmupSteps(warmupText);
  const exerciseCount = dayExercises.length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.helperText}>Cargando día...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow="EDITAR DÍA"
          title={routine?.name || fallbackName}
          subtitle={`${routine ? getDayLabel(routine.day_code) : 'Día'} · ${exerciseCount} ${
            exerciseCount === 1 ? 'ejercicio' : 'ejercicios'
          } · ordená cómo los hacés`}
          backLabel="Rutinas"
          onBack={handleGoBack}
          right={
            <TouchableOpacity
              style={styles.catalogButton}
              onPress={() => {
                setShowCatalogPicker((prev) => !prev);
                setStatusMsg(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.catalogButtonText}>
                {showCatalogPicker ? 'Cerrar' : '+ Del catálogo'}
              </Text>
            </TouchableOpacity>
          }
        />

        {statusMsg ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        ) : null}

        <View style={styles.warmupCard}>
          <View style={styles.warmupHeader}>
            <Text style={styles.warmupTitle}>Calentamiento</Text>
            <TouchableOpacity
              style={styles.editWarmupBtn}
              onPress={() => {
                const nextEditing = !editingWarmup;
                editingWarmupRef.current = nextEditing;
                if (nextEditing) setWarmupDraft(warmupText);
                setEditingWarmup(nextEditing);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.editWarmupText}>
                {editingWarmup ? 'Cancelar' : 'Editar'}
              </Text>
            </TouchableOpacity>
          </View>

          {editingWarmup ? (
            <View style={styles.warmupEditBox}>
              <Text style={styles.warmupHint}>
                Separá los pasos con → (o -&gt;). Ej: movilidad → aproximación →
                serie liviana.
              </Text>
              <TextInput
                style={styles.warmupInput}
                multiline
                numberOfLines={3}
                placeholder="Movilidad de hombros → 10 flexiones suaves → serie liviana de press"
                placeholderTextColor={colors.textFaint}
                value={warmupDraft}
                onChangeText={setWarmupDraft}
              />
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSaveWarmup}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>
                  Guardar calentamiento
                </Text>
              </TouchableOpacity>
            </View>
          ) : warmupSteps.length === 0 ? (
            <Text style={styles.emptyText}>
              Sin calentamiento cargado. Tocá "Editar" para agregarlo.
            </Text>
          ) : (
            <View style={styles.warmupStepsWrap}>
              {warmupSteps.map((step, idx) => (
                <View key={`${idx}-${step}`} style={styles.warmupStepRow}>
                  <Text style={styles.warmupBullet}>{idx + 1}.</Text>
                  <Text style={styles.warmupStepText}>{step}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {showCatalogPicker ? (
          <View style={styles.pickerCard}>
            <Text style={styles.sectionTitle}>Sumar un ejercicio</Text>
            <Text style={styles.pickerHint}>
              Se agrega al final del orden. Después lo podés mover con las
              flechas.
            </Text>

            {availableCatalog.length === 0 ? (
              <View style={styles.emptyCatalogBox}>
                <Text style={styles.emptyText}>
                  No quedan ejercicios del catálogo sin asignar a este día.
                </Text>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push('/exercises')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>
                    Ir al catálogo
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.pickerList}>
                {availableCatalog.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.pickerItem}
                    onPress={() => handleAssignFromCatalog(item)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.pickerItemInfo}>
                      <Text style={styles.pickerItemName}>{item.name}</Text>
                      <Text style={styles.pickerItemMeta}>
                        {item.default_sets} ser · {item.min_reps}–{item.max_reps}{' '}
                        reps{formatInitialWeight(item.initial_weight)}
                      </Text>
                    </View>
                    <Text style={styles.pickerAddText}>+ Sumar</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              Ejercicios de {routine?.name || fallbackName}
            </Text>
            <Text style={styles.orderHint}>en orden</Text>
          </View>
          <Text style={styles.sectionHint}>
            Tocá un ejercicio para editarlo. Con ↑ ↓ cambiás el orden en que se
            hacen; con ✕ lo sacás del día.
          </Text>

          {dayExercises.length === 0 ? (
            <View style={styles.emptyDayBox}>
              <Text style={styles.emptyText}>
                Este día todavía no tiene ejercicios. Sumá uno del catálogo o
                creá uno nuevo.
              </Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push('/exercises')}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>
                  Abrir catálogo
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.exerciseList}>
              {dayExercises.map((exercise, index) => {
                const isFirst = index === 0;
                const isLast = index === dayExercises.length - 1;

                return (
                  <View key={exercise.id} style={styles.exerciseRow}>
                    <TouchableOpacity
                      style={styles.exerciseMain}
                      onPress={() => setEditingExercise(exercise)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Editar ${exercise.name}`}
                    >
                      <View style={styles.exerciseTitleLine}>
                        <View style={styles.positionBadge}>
                          <Text style={styles.positionText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.exerciseName} numberOfLines={2}>
                          {exercise.name}
                        </Text>
                      </View>
                      <Text style={styles.exerciseMeta} numberOfLines={1}>
                        {exercise.default_sets} ser · {exercise.min_reps}–
                        {exercise.max_reps} reps{formatInitialWeight(exercise.initial_weight)}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.actionGrid}>
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[
                            styles.iconButton,
                            isFirst && styles.iconButtonDisabled,
                          ]}
                          onPress={() => handleMoveExercise(exercise, 'up')}
                          disabled={isFirst}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`Subir ${exercise.name}`}
                        >
                          <Text
                            style={[
                              styles.iconText,
                              isFirst && styles.iconTextDisabled,
                            ]}
                          >
                            ↑
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.iconButton,
                            isLast && styles.iconButtonDisabled,
                          ]}
                          onPress={() => handleMoveExercise(exercise, 'down')}
                          disabled={isLast}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`Bajar ${exercise.name}`}
                        >
                          <Text
                            style={[
                              styles.iconText,
                              isLast && styles.iconTextDisabled,
                            ]}
                          >
                            ↓
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={styles.iconButton}
                          onPress={() => setEditingExercise(exercise)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`Editar ${exercise.name}`}
                        >
                          <Text style={styles.iconText}>✎</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.iconButton, styles.removeButton]}
                          onPress={() => setPendingRemoval(exercise)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`Quitar ${exercise.name} del día`}
                        >
                          <Text style={[styles.iconText, styles.removeText]}>
                            ✕
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            style={styles.daySettingsButton}
            onPress={() => setDayFormVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.daySettingsText}>
              ✎ Editar nombre y día de la semana
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ExerciseEditorModal
        exercise={editingExercise}
        visible={Boolean(editingExercise)}
        onClose={() => setEditingExercise(null)}
        onSave={handleSaveExerciseEdit}
      />

      <RoutineFormModal
        visible={dayFormVisible}
        routine={routine}
        onSubmit={handleSaveRoutineData}
        onClose={() => setDayFormVisible(false)}
      />

      <ConfirmDialog
        visible={Boolean(pendingRemoval)}
        title="Quitar del día"
        message={
          pendingRemoval
            ? `"${pendingRemoval.name}" va a salir de este día. El historial de series se conserva y el ejercicio sigue en el catálogo.`
            : ''
        }
        confirmLabel="Quitar"
        destructive
        onConfirm={handleConfirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
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
  catalogButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  catalogButtonText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '800',
  },
  statusBox: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  warmupCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 10,
    ...cardShadow,
  },
  warmupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  warmupTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryText,
  },
  editWarmupBtn: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  editWarmupText: {
    color: colors.primaryText,
    fontSize: 11,
    fontWeight: '800',
  },
  warmupEditBox: {
    gap: 8,
  },
  warmupHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  warmupInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 76,
    textAlignVertical: 'top',
  },
  warmupStepsWrap: {
    gap: 6,
  },
  warmupStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 8,
  },
  warmupBullet: {
    color: colors.primaryText,
    fontWeight: '800',
    fontSize: 12,
  },
  warmupStepText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 10,
    ...cardShadow,
  },
  pickerHint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  pickerList: {
    gap: 8,
    marginTop: 4,
  },
  pickerItem: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  pickerItemMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pickerAddText: {
    color: colors.primaryText,
    fontWeight: '800',
    fontSize: 13,
  },
  emptyCatalogBox: {
    gap: 10,
    marginTop: 4,
  },
  emptyDayBox: {
    gap: 12,
  },
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...cardShadow,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  orderHint: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  exerciseList: {
    gap: 8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  exerciseMain: {
    flex: 1,
    gap: 3,
  },
  exerciseTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  positionText: {
    color: colors.primaryText,
    fontSize: 11,
    fontWeight: '800',
  },
  exerciseName: {
    flex: 1,
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  exerciseMeta: {
    color: colors.textMuted,
    fontSize: 12,
    paddingLeft: 32,
  },
  actionGrid: {
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconButtonDisabled: {
    opacity: 0.35,
  },
  iconText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  iconTextDisabled: {
    color: colors.textFaint,
  },
  removeButton: {
    borderColor: colors.dangerBorder,
  },
  removeText: {
    color: colors.danger,
  },
  daySettingsButton: {
    marginTop: spacing.xs,
    paddingVertical: 11,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  daySettingsText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: colors.primaryStrong,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingVertical: 11,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primaryText,
    fontWeight: '800',
    fontSize: 13,
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
    fontSize: 14,
  },
});
