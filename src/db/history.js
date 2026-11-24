/**
 * Historial de sesiones: sesiones paginadas con sus ejercicios y series,
 * con filtro opcional por ejercicio.
 *
 * No importa expo-sqlite para poder testearse con node:sqlite.
 */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function normalizeOptions(options) {
  const opts = typeof options === 'number' ? { limit: options } : options || {};
  const parsedLimit = Number.parseInt(opts.limit, 10);
  const parsedOffset = Number.parseInt(opts.offset, 10);
  const exerciseId = Number.parseInt(opts.exerciseId, 10);

  return {
    limit: Math.min(
      Math.max(Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT, 1),
      MAX_LIMIT
    ),
    offset: Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0,
    exerciseId: Number.isFinite(exerciseId) && exerciseId > 0 ? exerciseId : null,
  };
}

/**
 * Devuelve sesiones con al menos una serie registrada, de la más nueva a la
 * más vieja, ya agrupadas:
 *
 * {
 *   id, routineId, routineName, date, notes,
 *   setCount, volume,
 *   exercises: [{ id, name, volume, sets: [{ setNumber, weight, reps }] }]
 * }
 *
 * Opciones: { limit, offset, exerciseId }.
 */
export async function getRecentSessions(db, options = {}) {
  const { limit, offset, exerciseId } = normalizeOptions(options);

  const sessionFilter = exerciseId
    ? `AND EXISTS (
         SELECT 1 FROM set_logs filtered
         WHERE filtered.session_id = ws.id AND filtered.exercise_id = ?
       )`
    : '';

  const sessionParams = exerciseId
    ? [exerciseId, limit, offset]
    : [limit, offset];

  const sessions = await db.getAllAsync(
    `SELECT ws.id, ws.routine_id, ws.session_date, ws.notes,
            r.name AS routine_name
     FROM workout_sessions ws
     LEFT JOIN routines r ON r.id = ws.routine_id
     WHERE EXISTS (
       SELECT 1 FROM set_logs sl WHERE sl.session_id = ws.id
     )
     ${sessionFilter}
     ORDER BY ws.session_date DESC, ws.id DESC
     LIMIT ? OFFSET ?;`,
    sessionParams
  );

  if (!sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((session) => Number(session.id));
  const placeholders = sessionIds.map(() => '?').join(', ');

  const logFilter = exerciseId ? 'AND sl.exercise_id = ?' : '';
  const logParams = exerciseId ? [...sessionIds, exerciseId] : sessionIds;

  const rows = await db.getAllAsync(
    `SELECT sl.session_id, sl.exercise_id, e.name AS exercise_name,
            sl.set_number, sl.weight, sl.reps,
            COALESCE(re.sort_order, 9999) AS day_order
     FROM set_logs sl
     INNER JOIN workout_sessions ws ON ws.id = sl.session_id
     INNER JOIN exercises e ON e.id = sl.exercise_id
     LEFT JOIN routine_exercises re
       ON re.routine_id = ws.routine_id AND re.exercise_id = sl.exercise_id
     WHERE sl.session_id IN (${placeholders})
       ${logFilter}
     ORDER BY sl.session_id DESC, day_order ASC, e.name COLLATE NOCASE ASC,
              sl.set_number ASC;`,
    logParams
  );

  const sessionsById = new Map();
  for (const session of sessions) {
    sessionsById.set(Number(session.id), {
      id: Number(session.id),
      routineId: Number(session.routine_id),
      routineName: session.routine_name || 'Rutina',
      date: session.session_date,
      notes: session.notes || null,
      setCount: 0,
      volume: 0,
      exercises: [],
    });
  }

  for (const row of rows) {
    const session = sessionsById.get(Number(row.session_id));
    if (!session) continue;

    const exerciseIdRow = Number(row.exercise_id);
    let exercise = session.exercises.find((item) => item.id === exerciseIdRow);

    if (!exercise) {
      exercise = {
        id: exerciseIdRow,
        name: row.exercise_name,
        volume: 0,
        sets: [],
      };
      session.exercises.push(exercise);
    }

    const weight = Number(row.weight);
    const reps = Number(row.reps);
    const setVolume = weight * reps;

    exercise.sets.push({
      setNumber: Number(row.set_number),
      weight,
      reps,
    });
    exercise.volume += setVolume;
    session.volume += setVolume;
    session.setCount += 1;
  }

  return sessions.map((session) => {
    const grouped = sessionsById.get(Number(session.id));
    grouped.volume = Math.round(grouped.volume);
    grouped.exercises.forEach((exercise) => {
      exercise.volume = Math.round(exercise.volume);
    });
    return grouped;
  });
}

/** Cantidad total de sesiones (con el mismo filtro opcional). */
export async function countSessions(db, exerciseId = null) {
  const parsedExerciseId = Number.parseInt(exerciseId, 10);
  const hasFilter = Number.isFinite(parsedExerciseId) && parsedExerciseId > 0;

  const filter = hasFilter
    ? `AND EXISTS (
         SELECT 1 FROM set_logs filtered
         WHERE filtered.session_id = ws.id AND filtered.exercise_id = ?
       )`
    : '';

  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS total
     FROM workout_sessions ws
     WHERE EXISTS (
       SELECT 1 FROM set_logs sl WHERE sl.session_id = ws.id
     )
     ${filter};`,
    hasFilter ? [parsedExerciseId] : []
  );

  return Number(row?.total) || 0;
}

/** Ejercicios que aparecen en el historial, para el filtro. */
export async function getExerciseFilterOptions(db) {
  const rows = await db.getAllAsync(
    `SELECT e.id, e.name, COUNT(sl.id) AS set_count
     FROM exercises e
     INNER JOIN set_logs sl ON sl.exercise_id = e.id
     GROUP BY e.id
     ORDER BY e.name COLLATE NOCASE ASC;`
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    setCount: Number(row.set_count),
  }));
}

/**
 * Totales de todo el historial (no solo de lo que se ve en pantalla), con el
 * mismo filtro opcional por ejercicio. `bestWeight` es el peso más alto
 * registrado.
 */
export async function getHistoryTotals(db, exerciseId = null) {
  const parsedExerciseId = Number.parseInt(exerciseId, 10);
  const hasFilter = Number.isFinite(parsedExerciseId) && parsedExerciseId > 0;

  const row = await db.getFirstAsync(
    `SELECT COUNT(DISTINCT sl.session_id) AS sessions,
            COUNT(sl.id) AS sets,
            COALESCE(SUM(sl.weight * sl.reps), 0) AS volume,
            COALESCE(MAX(sl.weight), 0) AS best_weight
     FROM set_logs sl
     ${hasFilter ? 'WHERE sl.exercise_id = ?' : ''};`,
    hasFilter ? [parsedExerciseId] : []
  );

  return {
    sessions: Number(row?.sessions) || 0,
    sets: Number(row?.sets) || 0,
    volume: Math.round(Number(row?.volume) || 0),
    bestWeight: Number(row?.best_weight) || 0,
  };
}

/** Totales de una lista de sesiones, para el resumen de la pantalla. */
export function summarizeSessions(sessions = []) {
  return sessions.reduce(
    (summary, session) => ({
      sessions: summary.sessions + 1,
      sets: summary.sets + session.setCount,
      volume: summary.volume + session.volume,
    }),
    { sessions: 0, sets: 0, volume: 0 }
  );
}
