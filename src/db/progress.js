/**
 * Progreso y comparativas.
 *
 * Compara los últimos 7 días contra un período anterior ("semana anterior":
 * los 7 días previos; "mes anterior": las 4 semanas previas). El foco es la
 * carga real: el peso máximo de cada ejercicio en cada período, y no el
 * volumen total (peso × repeticiones).
 *
 * Usa las tablas workout_sessions, set_logs y exercises. No importa
 * expo-sqlite para poder testearse con node:sqlite.
 */

import { formatWeight } from '../utils/format.js';

export const PROGRESS_MODES = {
  WEEK: 'week', // última semana vs. semana anterior
  MONTH: 'month', // última semana vs. mes anterior (4 semanas previas)
};

const CURRENT_DAYS = 7;

function toISO(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function shiftDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Rangos de fechas (YYYY-MM-DD, inclusivos) de cada período. */
export function getProgressPeriods(mode, now = new Date()) {
  const referenceDays = mode === PROGRESS_MODES.MONTH ? 28 : 7;

  return {
    current: {
      start: toISO(shiftDays(now, -(CURRENT_DAYS - 1))),
      end: toISO(now),
      days: CURRENT_DAYS,
    },
    reference: {
      start: toISO(shiftDays(now, -(CURRENT_DAYS + referenceDays - 1))),
      end: toISO(shiftDays(now, -CURRENT_DAYS)),
      days: referenceDays,
    },
  };
}

function emptyPeriodStats() {
  return { sessions: new Set(), exercises: new Map() };
}

/** Suma una serie al período: peso máximo y lo mejor logrado con ese peso. */
function addSet(stats, row) {
  stats.sessions.add(Number(row.session_id));

  const exerciseId = Number(row.exercise_id);
  const weight = Number(row.weight);
  const reps = Number(row.reps);
  const rir = row.rir == null ? null : Number(row.rir);

  let entry = stats.exercises.get(exerciseId);
  if (!entry || weight > entry.weight) {
    entry = { name: row.name, weight, reps, rir };
    stats.exercises.set(exerciseId, entry);
    return;
  }

  if (weight === entry.weight) {
    entry.reps = Math.max(entry.reps, reps);
    if (rir != null) entry.rir = Math.max(entry.rir ?? 0, rir);
  }
}

function classify(current, reference) {
  if (!reference) return 'new';
  if (current.weight > reference.weight) return 'up';
  if (current.weight < reference.weight) return 'down';

  // Mismo peso máximo: mejora si hizo más repeticiones o terminó con más
  // reserva (RIR más alto) sin bajar las repeticiones.
  if (current.reps > reference.reps) return 'better';
  if (
    current.reps === reference.reps &&
    current.rir != null &&
    reference.rir != null &&
    current.rir > reference.rir
  ) {
    return 'better';
  }
  return 'same';
}

const STATUS_ORDER = { up: 0, better: 1, same: 2, down: 3, new: 4 };

/**
 * Resultado de la comparación:
 * {
 *   mode, periods,
 *   sessions: { current, reference, referencePerWeek },
 *   hasReference,
 *   counts: { up, better, same, down, new, comparable },
 *   exercises: [{ id, name, status, weight, referenceWeight, deltaKg,
 *                 deltaPct, reps, referenceReps, rir, referenceRir }]
 * }
 */
export async function getProgressComparison(
  db,
  mode = PROGRESS_MODES.WEEK,
  now = new Date()
) {
  const normalizedMode =
    mode === PROGRESS_MODES.MONTH ? PROGRESS_MODES.MONTH : PROGRESS_MODES.WEEK;
  const periods = getProgressPeriods(normalizedMode, now);

  const rows = await db.getAllAsync(
    `SELECT ws.id AS session_id, ws.session_date, sl.exercise_id,
            e.name AS name, sl.weight, sl.reps, sl.rir
     FROM set_logs sl
     INNER JOIN workout_sessions ws ON ws.id = sl.session_id
     INNER JOIN exercises e ON e.id = sl.exercise_id
     WHERE ws.session_date BETWEEN ? AND ?
     ORDER BY ws.session_date ASC, ws.id ASC, sl.set_number ASC;`,
    [periods.reference.start, periods.current.end]
  );

  const current = emptyPeriodStats();
  const reference = emptyPeriodStats();

  for (const row of rows) {
    const date = String(row.session_date);
    if (date >= periods.current.start && date <= periods.current.end) {
      addSet(current, row);
    } else if (date >= periods.reference.start && date <= periods.reference.end) {
      addSet(reference, row);
    }
  }

  const exercises = [];
  const counts = { up: 0, better: 0, same: 0, down: 0, new: 0, comparable: 0 };

  for (const [id, latest] of current.exercises) {
    const before = reference.exercises.get(id) || null;
    const status = classify(latest, before);
    counts[status] += 1;
    if (status !== 'new') counts.comparable += 1;

    const deltaKg = before ? Math.round((latest.weight - before.weight) * 100) / 100 : 0;
    exercises.push({
      id,
      name: latest.name,
      status,
      weight: latest.weight,
      referenceWeight: before ? before.weight : null,
      deltaKg,
      deltaPct:
        before && before.weight > 0
          ? Math.round(((latest.weight - before.weight) / before.weight) * 1000) / 10
          : 0,
      reps: latest.reps,
      referenceReps: before ? before.reps : null,
      rir: latest.rir,
      referenceRir: before ? before.rir : null,
    });
  }

  exercises.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      b.deltaPct - a.deltaPct ||
      a.name.localeCompare(b.name)
  );

  const referenceWeeks = periods.reference.days / 7;
  const referenceTotal = reference.sessions.size;

  return {
    mode: normalizedMode,
    periods,
    sessions: {
      current: current.sessions.size,
      reference: referenceTotal,
      referencePerWeek: Math.round((referenceTotal / referenceWeeks) * 10) / 10,
    },
    hasReference: referenceTotal > 0,
    counts,
    exercises,
  };
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function formatPct(value) {
  return String(value).replace('.', ',');
}

/**
 * Mensaje motivador según los datos reales. Prioriza subidas de peso y
 * sesiones completadas; una mejora de repeticiones con el mismo peso se
 * cuenta aparte, sin presentarla como un salto de fuerza.
 * Devuelve { tone, title, text }.
 */
export function buildProgressMessage(result) {
  const { sessions, counts, exercises, hasReference } = result;
  const weekly = sessions.referencePerWeek;

  if (sessions.current === 0) {
    return {
      tone: 'empty',
      title: 'Todavía no entrenaste en los últimos 7 días',
      text: hasReference
        ? `Antes completaste ${plural(sessions.reference, 'sesión', 'sesiones')}. ¡Sumá una hoy y retomá el ritmo!`
        : 'Registrá tu primera sesión y acá vas a ver cómo venís.',
    };
  }

  if (!hasReference) {
    return {
      tone: 'start',
      title: 'Todavía faltan datos para comparar',
      text: `Completaste ${plural(sessions.current, 'sesión', 'sesiones')} en los últimos 7 días. Lo vas a ver reflejado acá a medida que registres más sesiones.`,
    };
  }

  const sessionsClause =
    sessions.current >= weekly
      ? ` Además completaste ${plural(sessions.current, 'sesión', 'sesiones')}.`
      : '';

  if (counts.up > 0) {
    const top = exercises.find((exercise) => exercise.status === 'up');
    const detail = `${top.name}: ${formatWeight(top.referenceWeight)} → ${formatWeight(top.weight)} kg (+${formatPct(top.deltaPct)}%).`;
    return {
      tone: 'great',
      title:
        counts.up === 1
          ? '¡Subiste carga en 1 ejercicio!'
          : `¡Subiste carga en ${counts.up} ejercicios!`,
      text: `${detail}${sessionsClause}`,
    };
  }

  const betterClause =
    counts.better > 0
      ? ` Con el mismo peso rendiste mejor en ${plural(counts.better, 'ejercicio', 'ejercicios')}.`
      : '';

  if (sessions.current >= weekly) {
    return {
      tone: 'steady',
      title: '¡Constancia sólida!',
      text: `Completaste ${plural(sessions.current, 'sesión', 'sesiones')}${
        sessions.current > weekly ? ', más que antes' : ', igual que antes'
      }.${betterClause}`,
    };
  }

  if (counts.better > 0) {
    return {
      tone: 'steady',
      title: 'Mejoraste con el mismo peso',
      text: `Mantuviste la carga y rendiste mejor en ${plural(counts.better, 'ejercicio', 'ejercicios')}. Cuando completes el rango de repeticiones, el próximo paso es subir peso.`,
    };
  }

  return {
    tone: 'maintain',
    title: 'Semana de mantenimiento',
    text: 'Mantuviste tu carga. La constancia también suma: seguí registrando para ver tu próximo salto.',
  };
}
