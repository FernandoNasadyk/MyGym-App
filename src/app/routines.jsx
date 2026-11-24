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
import { getRoutineExerciseNames } from '../db/day-exercises';
import {
  createRoutine,
  deleteRoutine,
  getTodayCode,
  getRoutines,
  moveRoutine,
  updateRoutine,
} from '../db/routines';
import { getDayLabel } from '../constants/weekdays';
import { colors, radius, spacing, cardShadow } from '../constants/app-theme';
import ScreenHeader from '../components/screen-header';
import RoutineFormModal from '../components/routine-form-modal';
import ConfirmDialog from '../components/confirm-dialog';
import { formatDateShort } from '../utils/format';

function RoutineCard({
  routine,
  index,
  isFirst,
  isLast,
  isToday,
  names,
  onOpen,
  onMove,
  onEdit,
  onDelete,
}) {
  const exerciseCount = routine.exercise_count;
  const preview = names.slice(0, 3).join(' · ');
  const remaining = names.length - 3;

  return (
    <View style={[styles.card, isToday && styles.cardToday]}>
      <TouchableOpacity
        style={styles.cardMain}
        onPress={onOpen}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Editar ejercicios de ${routine.name}`}
      >
        <View style={styles.cardTop}>
          <View style={[styles.indexBadge, isToday && styles.indexBadgeToday]}>
            <Text style={styles.indexText}>
              {String(index + 1).padStart(2, '0')}
            </Text>
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {routine.name}
              </Text>
              {isToday ? (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>HOY</Text>
                </View>
              ) : null}
              {routine.is_extra === 1 ? (
                <View style={styles.extraBadge}>
                  <Text style={styles.extraBadgeText}>EXTRA</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.cardMeta}>
              {getDayLabel(routine.day_code)} · {exerciseCount}{' '}
              {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
              {routine.last_session_date
                ? ` · última ${formatDateShort(routine.last_session_date)}`
                : ''}
            </Text>
          </View>

          <Text style={styles.chevron}>→</Text>
        </View>

        <Text
          style={names.length > 0 ? styles.preview : styles.previewEmpty}
          numberOfLines={1}
        >
          {names.length > 0
            ? `${preview}${remaining > 0 ? ` +${remaining}` : ''}`
            : 'Sin ejercicios todavía. Tocá para agregarlos.'}
        </Text>
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <View style={styles.iconGroup}>
          <TouchableOpacity
            style={[styles.iconButton, isFirst && styles.iconButtonDisabled]}
            onPress={() => onMove(routine, 'up')}
            disabled={isFirst}
            accessibilityRole="button"
            accessibilityLabel={`Subir ${routine.name}`}
          >
            <Text style={[styles.iconText, isFirst && styles.iconTextDisabled]}>
              ↑
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, isLast && styles.iconButtonDisabled]}
            onPress={() => onMove(routine, 'down')}
            disabled={isLast}
            accessibilityRole="button"
            accessibilityLabel={`Bajar ${routine.name}`}
          >
            <Text style={[styles.iconText, isLast && styles.iconTextDisabled]}>
              ↓
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onEdit(routine)}
            accessibilityRole="button"
            accessibilityLabel={`Editar datos de ${routine.name}`}
          >
            <Text style={styles.iconText}>✎</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.iconDanger]}
            onPress={() => onDelete(routine)}
            accessibilityRole="button"
            accessibilityLabel={`Eliminar ${routine.name}`}
          >
            <Text style={[styles.iconText, styles.iconDangerText]}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.actionsHint}>Mover · editar · eliminar</Text>
      </View>
    </View>
  );
}

export default function RoutinesScreen() {
  const router = useRouter();

  const [routines, setRoutines] = useState([]);
  const [namesMap, setNamesMap] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const busyRef = useRef(false);
  const todayCode = getTodayCode();

  const loadRoutines = useCallback(async () => {
    try {
      const db = await getDatabase();
      const [rows, names] = await Promise.all([
        getRoutines(db),
        getRoutineExerciseNames(db),
      ]);
      setRoutines(rows);
      setNamesMap(names);
    } catch (err) {
      console.error('Error cargando rutinas:', err);
      setStatusMsg('No se pudieron cargar los días.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRoutines();
    }, [loadRoutines])
  );

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const openEditor = (routine) => {
    router.push({
      pathname: '/routine',
      params: {
        routineId: String(routine.id),
        routineName: routine.name,
      },
    });
  };

  const handleCreate = async (data) => {
    const db = await getDatabase();
    const created = await createRoutine(db, data);

    setFormVisible(false);
    setEditingRoutine(null);
    await loadRoutines();

    router.push({
      pathname: '/routine',
      params: {
        routineId: String(created.id),
        routineName: data.name.trim(),
      },
    });
  };

  const handleUpdate = async (data) => {
    const db = await getDatabase();
    await updateRoutine(db, editingRoutine.id, data);

    setFormVisible(false);
    setEditingRoutine(null);
    await loadRoutines();
    setStatusMsg(`"${data.name.trim()}" actualizado.`);
  };

  const handleMove = async (routine, direction) => {
    if (busyRef.current) return;

    const index = routines.findIndex((item) => item.id === routine.id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= routines.length) return;

    const reordered = routines.slice();
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setRoutines(reordered);
    setStatusMsg(null);

    try {
      busyRef.current = true;
      const db = await getDatabase();
      const moved = await moveRoutine(db, routine.id, direction);
      if (!moved) await loadRoutines();
    } catch (err) {
      console.error('Error moviendo día:', err);
      setStatusMsg('No se pudo cambiar el orden.');
      await loadRoutines();
    } finally {
      busyRef.current = false;
    }
  };

  const handleConfirmDelete = async () => {
    const routine = pendingDelete;
    setPendingDelete(null);
    if (!routine) return;

    try {
      const db = await getDatabase();
      await deleteRoutine(db, routine.id);
      await loadRoutines();
      setStatusMsg(`"${routine.name}" se eliminó.`);
    } catch (err) {
      setStatusMsg(err?.message || 'No se pudo eliminar el día.');
    }
  };

  const openCreate = () => {
    setEditingRoutine(null);
    setStatusMsg(null);
    setFormVisible(true);
  };

  const openEdit = (routine) => {
    setEditingRoutine(routine);
    setStatusMsg(null);
    setFormVisible(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.helperText}>Cargando días...</Text>
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
          eyebrow="ORGANIZÁ TU SEMANA"
          title="Rutinas"
          subtitle="Creá tus días y armá qué ejercicios van en cada uno. La pantalla de inicio solo se usa para entrenar."
          backLabel="Inicio"
          onBack={handleGoBack}
          right={
            <TouchableOpacity
              style={styles.addButton}
              onPress={openCreate}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Crear un día nuevo"
            >
              <Text style={styles.addButtonText}>+ Nueva</Text>
            </TouchableOpacity>
          }
        />

        {statusMsg ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tus días</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{routines.length}</Text>
          </View>
        </View>

        {routines.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Todavía no tenés días</Text>
            <Text style={styles.emptyText}>
              Creá el primero y asignale sus ejercicios desde el catálogo.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={openCreate}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Crear día</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {routines.map((routine, index) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                index={index}
                isFirst={index === 0}
                isLast={index === routines.length - 1}
                isToday={routine.day_code === todayCode}
                names={namesMap.get(routine.id) || []}
                onOpen={() => openEditor(routine)}
                onMove={handleMove}
                onEdit={openEdit}
                onDelete={setPendingDelete}
              />
            ))}
          </View>
        )}

        <Text style={styles.footnote}>
          Los días con sesiones registradas no se pueden eliminar para no perder
          el historial. Podés renombrarlos o cambiarles el día.
        </Text>
      </ScrollView>

      <RoutineFormModal
        visible={formVisible}
        routine={editingRoutine}
        onSubmit={editingRoutine ? handleUpdate : handleCreate}
        onClose={() => {
          setFormVisible(false);
          setEditingRoutine(null);
        }}
      />

      <ConfirmDialog
        visible={Boolean(pendingDelete)}
        title="Eliminar día"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" y sus ejercicios asignados se van a eliminar. Si tiene sesiones registradas, no se va a poder borrar.`
            : ''
        }
        confirmLabel="Eliminar"
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
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  addButtonText: {
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
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
  list: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...cardShadow,
  },
  cardToday: {
    borderColor: colors.primaryBorder,
  },
  cardMain: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  indexBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  indexBadgeToday: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  indexText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '800',
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    maxWidth: '65%',
  },
  todayBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  todayBadgeText: {
    color: colors.primaryText,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  extraBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  extraBadgeText: {
    color: colors.textMuted,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 11.5,
  },
  chevron: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  preview: {
    color: colors.textSecondary,
    fontSize: 11.5,
    paddingLeft: 50,
  },
  previewEmpty: {
    color: colors.textFaint,
    fontSize: 11.5,
    fontStyle: 'italic',
    paddingLeft: 50,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
  iconGroup: {
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
    fontSize: 13,
    fontWeight: '800',
  },
  iconTextDisabled: {
    color: colors.textFaint,
  },
  iconDanger: {
    borderColor: colors.dangerBorder,
  },
  iconDangerText: {
    color: colors.danger,
  },
  actionsHint: {
    color: colors.textFaint,
    fontSize: 9.5,
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
  footnote: {
    color: colors.textFaint,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
