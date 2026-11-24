/**
 * Lógica pura del entrenamiento del día (borradores de series en pantalla).
 *
 * Un borrador es un objeto { [exerciseId]: [{ weight: '40', reps: '8' }] } con
 * los valores tal cual los escribe la persona (strings). No depende de React
 * Native ni de SQLite, así que se puede testear con node.
 */

import { WEIGHT_STEP } from '../constants/training.js';

const MAX_SETS = 20;

/** Deja solo dígitos y una coma/punto decimal (máx. 2 decimales). */
export function sanitizeWeightInput(value) {
  const cleaned = String(value ?? '')
    .replace(/[^0-9.,]/g, '')
    .replace(',', '.');

  const [integer, ...rest] = cleaned.split('.');
  if (rest.length === 0) return integer.slice(0, 4);

  const decimals = rest.join('').slice(0, 2);
  return `${integer.slice(0, 4)}.${decimals}`;
}

/** Deja solo dígitos (máx. 3). */
export function sanitizeRepsInput(value) {
  return String(value ?? '')
    .replace(/[^0-9]/g, '')
    .slice(0, 3);
}

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Una serie está completa cuando tiene repeticiones (el peso puede ser 0). */
export function isSetFilled(set) {
  const reps = Number.parseInt(set?.reps, 10);
  return Number.isInteger(reps) && reps > 0;
}

/** Un ejercicio está completo cuando todas sus series tienen repeticiones. */
export function isExerciseComplete(sets = []) {
  return sets.length > 0 && sets.every(isSetFilled);
}

/** Cuántos ejercicios del día están completos. */
export function countCompleted(exercises = [], drafts = {}) {
  return exercises.filter((exercise) =>
    isExerciseComplete(drafts[exercise.id])
  ).length;
}

/** El botón "Finalizar" aparece cuando todos los ejercicios están completos. */
export function isWorkoutComplete(exercises = [], drafts = {}) {
  return (
    exercises.length > 0 &&
    countCompleted(exercises, drafts) === exercises.length
  );
}

/**
 * Suma o resta un salto de peso (por defecto, el salto fijo de 2,5 kg).
 * Nunca baja de 0 y evita errores de coma flotante (2.5 + 2.5 + ... queda
 * siempre con a lo sumo 2 decimales).
 */
export function adjustWeight(value, step, direction) {
  const current = toNumber(value);
  const base = Number.isFinite(current) ? current : 0;
  const delta = Number(step) > 0 ? Number(step) : WEIGHT_STEP;
  const next = direction === 'down' ? base - delta : base + delta;
  const rounded = Math.round(Math.max(0, next) * 100) / 100;
  return String(rounded);
}

/**
 * Arma los borradores iniciales de todos los ejercicios.
 *
 * - Si hoy ya se guardó una sesión, se muestran esas series.
 * - Si no, la cantidad de series sale del ejercicio y el peso se precarga con
 *   el de la última sesión (las repeticiones quedan vacías).
 * - Si el ejercicio todavía no tiene historial, el peso se precarga con su
 *   "peso inicial" (si tiene uno). Siempre se puede editar en pantalla.
 */
export function buildInitialDrafts(exercises = [], lastLogs, savedLogs) {
  const drafts = {};

  for (const exercise of exercises) {
    const saved = savedLogs?.get(exercise.id);
    if (saved && saved.length > 0) {
      drafts[exercise.id] = saved.map((set) => ({
        weight: String(set.weight),
        reps: String(set.reps),
      }));
      continue;
    }

    const last = lastLogs?.get(exercise.id) || [];
    const count = Math.min(
      Math.max(Number(exercise.default_sets) || 2, 1),
      MAX_SETS
    );
    const initialWeight = Number(exercise.initial_weight);
    const startWeight =
      Number.isFinite(initialWeight) && initialWeight > 0
        ? String(initialWeight)
        : '';
    const fallbackWeight = last.length > 0 ? String(last[0].weight) : startWeight;

    drafts[exercise.id] = Array.from({ length: count }, (_, index) => {
      const previous = last[index];
      return {
        weight: previous ? String(previous.weight) : fallbackWeight,
        reps: '',
      };
    });
  }

  return drafts;
}

/** Agrega una serie copiando el peso de la anterior. */
export function addSet(sets = []) {
  if (sets.length >= MAX_SETS) return sets;
  const lastWeight = sets.length > 0 ? sets[sets.length - 1].weight : '';
  return [...sets, { weight: lastWeight, reps: '' }];
}

/** Quita la última serie (siempre queda al menos una). */
export function removeLastSet(sets = []) {
  if (sets.length <= 1) return sets;
  return sets.slice(0, -1);
}

/**
 * RIR inicial de cada ejercicio: el que se guardó hoy (si ya hay una sesión
 * guardada) o null = sin RIR. Devuelve { [exerciseId]: 1 | 2 | 3 | null }.
 */
export function buildInitialRir(exercises = [], savedLogs) {
  const rirByExercise = {};
  for (const exercise of exercises) {
    const saved = savedLogs?.get(exercise.id) || [];
    const withRir = saved.find((set) => set.rir != null);
    rirByExercise[exercise.id] = withRir ? Number(withRir.rir) : null;
  }
  return rirByExercise;
}

/**
 * Ejercicios que arrancan contraídos al cargar el día: todos menos el primero.
 * (El calentamiento y el primer ejercicio inician abiertos.)
 */
export function buildInitialCollapsed(exercises = []) {
  return new Set(exercises.slice(1).map((exercise) => exercise.id));
}

/** Convierte los borradores en las entradas que espera saveWorkout. */
export function buildWorkoutEntries(exercises = [], drafts = {}, rirByExercise = {}) {
  return exercises.map((exercise) => ({
    exerciseId: exercise.id,
    rir: rirByExercise[exercise.id] ?? null,
    sets: (drafts[exercise.id] || []).map((set) => ({
      weight: set.weight,
      reps: set.reps,
    })),
  }));
}

/**
 * Texto corto con lo que se hizo la última vez: "40 kg × 8 · 8 · 7" y, si se
 * registró, el RIR: "40 kg × 8 · 8 · 7 · RIR 2".
 */
export function describeLastSets(sets = [], formatWeight = String) {
  if (!sets || sets.length === 0) return '';
  const allSameWeight = sets.every((set) => set.weight === sets[0].weight);
  const base = allSameWeight
    ? `${formatWeight(sets[0].weight)} kg × ${sets
        .map((set) => set.reps)
        .join(' · ')}`
    : sets.map((set) => `${formatWeight(set.weight)}×${set.reps}`).join(' · ');

  const rir = sets.find((set) => set.rir != null)?.rir;
  return rir != null ? `${base} · RIR ${rir}` : base;
}
