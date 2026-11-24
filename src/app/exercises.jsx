import React, { useCallback, useState } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { getDatabase } from '../db/database';
import {
  appendExerciseToDay,
  createExercise,
  deactivateExercise,
  getAssignedMap,
  normalizeExerciseInput,
  removeExerciseFromDay,
  updateExercise,
} from '../db/day-exercises';
import ExerciseEditorModal from '../components/exercise-editor-modal';
import ConfirmDialog from '../components/confirm-dialog';
import ScreenHeader from '../components/screen-header';
import { cardShadow, colors, radius, spacing } from '../constants/app-theme';

export default function ExercisesCatalogScreen() {
  const router = useRouter();

  const [routines, setRoutines] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [assignedMap, setAssignedMap] = useState(() => new Map());
  const [search, setSearch] = useState('');

  // Formulario de nuevo ejercicio
  const [name, setName] = useState('');
  const [defaultSets, setDefaultSets] = useState('2');
  const [minReps, setMinReps] = useState('6');
  const [maxReps, setMaxReps] = useState('10');
  const [weightStep, setWeightStep] = useState('2.5');
  const [selectedRoutineIds, setSelectedRoutineIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Modales de edición y baja
  const [editingExercise, setEditingExercise] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const loadCatalog = useCallback(async () => {
    try {
      setStatusMsg(null);
      const db = await getDatabase();

      const routineRows = await db.getAllAsync(
        'SELECT * FROM routines ORDER BY sort_order ASC;'
      );
      setRoutines(routineRows);

      const exerciseRows = await db.getAllAsync(
        'SELECT * FROM exercises WHERE is_active = 1 ORDER BY name COLLATE NOCASE ASC;'
      );
      setExercises(exerciseRows);

      setAssignedMap(await getAssignedMap(db));
    } catch (err) {
      console.error('Error cargando catálogo de ejercicios:', err);
      setStatusMsg('No se pudo cargar el catálogo desde SQLite.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCatalog();
    }, [loadCatalog])
  );

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const toggleNewRoutineSelection = (routineId) => {
    setSelectedRoutineIds((prev) =>
      prev.includes(routineId)
        ? prev.filter((id) => id !== routineId)
        : [...prev, routineId]
    );
  };

  const resetForm = () => {
    setName('');
    setDefaultSets('2');
    setMinReps('6');
    setMaxReps('10');
    setWeightStep('2.5');
    setSelectedRoutineIds([]);
  };

  const handleCreateExercise = async () => {
    try {
      setSaving(true);
      setStatusMsg(null);

      const data = normalizeExerciseInput({
        name,
        defaultSets,
        minReps,
        maxReps,
        weightStep,
      });

      const db = await getDatabase();
      const created = await createExercise(db, data);

      for (const routineId of selectedRoutineIds) {
        await appendExerciseToDay(db, routineId, created.id);
      }

      resetForm();
      await loadCatalog();
      setStatusMsg(
        created.reactivated
          ? `"${data.name}" volvió al catálogo.`
          : `"${data.name}" guardado en tu catálogo.`
      );
    } catch (err) {
      setStatusMsg(err?.message || 'No se pudo guardar el ejercicio.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRoutineAssignment = async (exercise, routineId) => {
    try {
      setStatusMsg(null);
      const db = await getDatabase();
      const assignedSet = assignedMap.get(exercise.id) || new Set();

      if (assignedSet.has(routineId)) {
        await removeExerciseFromDay(db, routineId, exercise.id);
      } else {
        await appendExerciseToDay(db, routineId, exercise.id);
      }

      await loadCatalog();
    } catch (err) {
      console.error('Error actualizando asignación de día:', err);
      setStatusMsg('No se pudo actualizar el día del ejercicio.');
    }
  };

  const handleSaveExerciseEdit = async (data) => {
    const exercise = editingExercise;
    if (!exercise) return;

    const db = await getDatabase();
    await updateExercise(db, exercise.id, data);
    setEditingExercise(null);

    await loadCatalog();
    setStatusMsg(`"${data.name}" actualizado.`);
  };

  const handleConfirmDelete = async () => {
    const exercise = pendingDelete;
    setPendingDelete(null);
    if (!exercise) return;

    try {
      setStatusMsg(null);
      const db = await getDatabase();
      await deactivateExercise(db, exercise.id);
      await loadCatalog();
      setStatusMsg(
        `"${exercise.name}" se quitó del catálogo. El historial de series queda guardado.`
      );
    } catch (err) {
      console.error('Error quitando ejercicio del catálogo:', err);
      setStatusMsg('No se pudo quitar el ejercicio del catálogo.');
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const visibleExercises = normalizedSearch
    ? exercises.filter((ex) => ex.name.toLowerCase().includes(normalizedSearch))
    : exercises;

  const pendingDeleteDays = pendingDelete
    ? (assignedMap.get(pendingDelete.id) || new Set()).size
    : 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.helperText}>Cargando catálogo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          eyebrow="CATÁLOGO BASE"
          title="Ejercicios"
          subtitle="Cargá una vez tus ejercicios y asignalos a los días. Después, en cada día, los podés ordenar como quieras."
          backLabel="Inicio"
          onBack={handleGoBack}
        />

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Nuevo ejercicio</Text>

          <Text style={styles.label}>Nombre del ejercicio</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Peso muerto rumano"
            placeholderTextColor="#64748b"
            value={name}
            onChangeText={setName}
          />

          <View style={styles.rowInputs}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Series por defecto</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={defaultSets}
                onChangeText={setDefaultSets}
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Salto de peso (kg)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={weightStep}
                onChangeText={setWeightStep}
              />
            </View>
          </View>

          <View style={styles.rowInputs}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Mín. repeticiones</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={minReps}
                onChangeText={setMinReps}
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Máx. repeticiones</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={maxReps}
                onChangeText={setMaxReps}
              />
            </View>
          </View>

          <Text style={styles.label}>Asignar a días (opcional)</Text>
          <View style={styles.daysWrap}>
            {routines.map((r) => {
              const active = selectedRoutineIds.includes(r.id);
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() => toggleNewRoutineSelection(r.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      active && styles.dayChipTextActive,
                    ]}
                  >
                    {r.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleCreateExercise}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? 'Guardando...' : 'Guardar en catálogo'}
            </Text>
          </TouchableOpacity>
        </View>

        {statusMsg && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        )}

        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Tu catálogo</Text>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{exercises.length}</Text>
            </View>
          </View>
          <Text style={styles.listHint}>
            Tocá un día para asignar o quitar el ejercicio. También podés
            editarlo o darlo de baja.
          </Text>

          {exercises.length === 0 ? (
            <Text style={styles.emptyText}>
              Todavía no cargaste ejercicios. Empezá agregando los de tu Excel
              arriba.
            </Text>
          ) : (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nombre..."
                placeholderTextColor="#64748b"
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />

              {visibleExercises.length === 0 ? (
                <Text style={styles.emptyText}>
                  No hay ejercicios que coincidan con "{search.trim()}".
                </Text>
              ) : (
                visibleExercises.map((ex) => {
                  const assignedSet = assignedMap.get(ex.id) || new Set();
                  return (
                    <View key={ex.id} style={styles.exerciseCard}>
                      <View style={styles.exerciseTop}>
                        <View style={styles.exerciseTopText}>
                          <Text style={styles.exerciseName}>{ex.name}</Text>
                          <Text style={styles.exerciseMeta}>
                            {ex.default_sets} ser · {ex.min_reps}–{ex.max_reps}{' '}
                            reps · +{ex.weight_step} kg · {assignedSet.size}{' '}
                            {assignedSet.size === 1 ? 'día' : 'días'}
                          </Text>
                        </View>

                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            style={styles.smallButton}
                            onPress={() => setEditingExercise(ex)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Editar ${ex.name}`}
                          >
                            <Text style={styles.smallButtonText}>✎ Editar</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.smallButton, styles.smallButtonDanger]}
                            onPress={() => setPendingDelete(ex)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar ${ex.name} del catálogo`}
                          >
                            <Text
                              style={[
                                styles.smallButtonText,
                                styles.smallButtonDangerText,
                              ]}
                            >
                              ✕
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={styles.assignHint}>
                        Tocá un día para incluirlo o quitarlo:
                      </Text>
                      <View style={styles.daysWrap}>
                        {routines.map((r) => {
                          const isAssigned = assignedSet.has(r.id);
                          return (
                            <TouchableOpacity
                              key={r.id}
                              style={[
                                styles.miniDayChip,
                                isAssigned && styles.miniDayChipActive,
                              ]}
                              onPress={() =>
                                handleToggleRoutineAssignment(ex, r.id)
                              }
                              activeOpacity={0.8}
                            >
                              <Text
                                style={[
                                  styles.miniDayChipText,
                                  isAssigned && styles.miniDayChipTextActive,
                                ]}
                              >
                                {isAssigned ? `✓ ${r.name}` : r.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ExerciseEditorModal
        exercise={editingExercise}
        visible={Boolean(editingExercise)}
        onClose={() => setEditingExercise(null)}
        onSave={handleSaveExerciseEdit}
      />

      <ConfirmDialog
        visible={Boolean(pendingDelete)}
        title="Quitar del catálogo"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" va a desaparecer del catálogo${
                pendingDeleteDays > 0
                  ? ` y de ${pendingDeleteDays} ${
                      pendingDeleteDays === 1 ? 'día' : 'días'
                    }`
                  : ''
              }. Las series ya registradas se conservan; si volvés a crearlo con el mismo nombre, arranca sin días asignados.`
            : ''
        }
        confirmLabel="Quitar"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
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
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countPill: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
  },
  countPillText: {
    color: colors.primaryText,
    fontSize: 11,
    fontWeight: '800',
  },
  listHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 10,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.text,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  input: {
    backgroundColor: '#090d0b',
    borderWidth: 1,
    borderColor: '#1f3328',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecfdf5',
    fontSize: 15,
  },
  searchInput: {
    backgroundColor: '#090d0b',
    borderWidth: 1,
    borderColor: '#1f3328',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecfdf5',
    fontSize: 15,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  halfInput: {
    flex: 1,
    gap: 4,
  },
  daysWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  dayChip: {
    backgroundColor: '#090d0b',
    borderWidth: 1,
    borderColor: '#1f3328',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  dayChipActive: {
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
  },
  dayChipText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: '#34d399',
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: '#ecfdf5',
    fontWeight: '700',
    fontSize: 15,
  },
  statusBox: {
    backgroundColor: '#111a15',
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    padding: 12,
    borderRadius: 10,
  },
  statusText: {
    color: '#d1fae5',
    fontSize: 14,
    fontWeight: '600',
  },
  listSection: {
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    gap: spacing.sm,
    ...cardShadow,
  },
  exerciseTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  exerciseTopText: {
    flex: 1,
    gap: 3,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ecfdf5',
  },
  exerciseMeta: {
    fontSize: 12,
    color: '#34d399',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  smallButton: {
    backgroundColor: '#090d0b',
    borderWidth: 1,
    borderColor: '#1f3328',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  smallButtonText: {
    color: '#d1fae5',
    fontSize: 12,
    fontWeight: '700',
  },
  smallButtonDanger: {
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  smallButtonDangerText: {
    color: '#f87171',
  },
  assignHint: {
    fontSize: 12,
    color: '#94a3b8',
  },
  miniDayChip: {
    backgroundColor: '#090d0b',
    borderWidth: 1,
    borderColor: '#1f3328',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  miniDayChipActive: {
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
  },
  miniDayChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  miniDayChipTextActive: {
    color: '#6ee7b7',
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  helperText: {
    color: '#d1fae5',
    marginTop: 12,
    fontSize: 15,
  },
});
