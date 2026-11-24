/**
 * Entrenamiento guiado del día: datos para armar los borradores de series y
 * guardado de la sesión completa.
 *
 * No importa expo-sqlite para poder testearse con node:sqlite.
 */
import { getDayExercises } from './day-exercises.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseWeight(value) {
  if (value === '' || value == null) return 0;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Valida y normaliza las series de un entrenamiento.
 * Las series sin repeticiones se ignoran (quedaron sin completar).
 */
export function normalizeWorkoutEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('No hay series para guardar.');
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of entries) {
    const exerciseId = Number(entry?.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
      throw new Error('Hay un ejercicio inválido en el entrenamiento.');
    }
    if (seen.has(exerciseId)) {
      throw new Error('Hay un ejercicio repetido en el entrenamiento.');
    }
    seen.add(exerciseId);

    const sets = [];
    for (const raw of entry.sets || []) {
      const reps = Number.parseInt(raw?.reps, 10);
      if (!Number.isInteger(reps) || reps <= 0) continue;
      if (reps > 1000) {
        throw new Error('Las repeticiones no pueden superar 1000.');
      }

      const weight = parseWeight(raw?.weight);
      if (!Number.isFinite(weight) || weight < 0 || weight > 1000) {
        throw new Error('El peso tiene que ser un número entre 0 y 1000 kg.');
      }

      sets.push({
        weight: Math.round(weight * 100) / 100,
        reps,
      });
    }

    if (sets.length > 0) {
      normalized.push({ exerciseId, sets });
    }
  }

  if (normalized.length === 0) {
    throw new Error(
      'Cargá al menos una serie con repeticiones para finalizar el entrenamiento.'
    );
  }

  return normalized;
}

/**
 * Últimas series de cada ejercicio (de su sesión más reciente).
 * Devuelve un Map exerciseId -> [{ setNumber, weight, reps }].
 */
export async function getLastSetLogs(db, exerciseIds = []) {
  const ids = exerciseIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.getAllAsync(
    `WITH latest AS (
       SELECT sl.exercise_id, MAX(ws.id) AS session_id
       FROM set_logs sl
       INNER JOIN workout_sessions ws ON ws.id = sl.session_id
       WHERE sl.exercise_id IN (${placeholders})
       GROUP BY sl.exercise_id
     )
     SELECT sl.exercise_id, sl.set_number, sl.weight, sl.reps
     FROM set_logs sl
     INNER JOIN latest l
       ON l.exercise_id = sl.exercise_id AND l.session_id = sl.session_id
     ORDER BY sl.exercise_id ASC, sl.set_number ASC;`,
    ids
  );

  const map = new Map();
  for (const row of rows) {
    const exerciseId = Number(row.exercise_id);
    if (!map.has(exerciseId)) map.set(exerciseId, []);
    map.get(exerciseId).push({
      setNumber: Number(row.set_number),
      weight: Number(row.weight),
      reps: Number(row.reps),
    });
  }
  return map;
}

/** Sesión guardada de un día en una fecha (con sus totales), o null. */
export async function getSessionForDate(db, routineId, date) {
  const row = await db.getFirstAsync(
    `SELECT ws.id,
            COUNT(sl.id) AS set_count,
            COUNT(DISTINCT sl.exercise_id) AS exercise_count,
            COALESCE(SUM(sl.weight * sl.reps), 0) AS volume
     FROM workout_sessions ws
     LEFT JOIN set_logs sl ON sl.session_id = ws.id
     WHERE ws.routine_id = ? AND ws.session_date = ?
     GROUP BY ws.id
     ORDER BY ws.id DESC
     LIMIT 1;`,
    [routineId, date]
  );

  if (!row) return null;

  return {
    id: Number(row.id),
    setCount: Number(row.set_count),
    exerciseCount: Number(row.exercise_count),
    volume: Math.round(Number(row.volume)),
  };
}

/** Series guardadas de una sesión, agrupadas por ejercicio. */
export async function getSessionLogs(db, sessionId) {
  const rows = await db.getAllAsync(
    `SELECT exercise_id, set_number, weight, reps
     FROM set_logs
     WHERE session_id = ?
     ORDER BY exercise_id ASC, set_number ASC;`,
    [sessionId]
  );

  const map = new Map();
  for (const row of rows) {
    const exerciseId = Number(row.exercise_id);
    if (!map.has(exerciseId)) map.set(exerciseId, []);
    map.get(exerciseId).push({
      setNumber: Number(row.set_number),
      weight: Number(row.weight),
      reps: Number(row.reps),
    });
  }
  return map;
}

/**
 * Datos completos para armar la pantalla de entrenamiento.
 */
export async function getWorkoutData(db, routineId, date) {
  const exercises = await getDayExercises(db, routineId);
  const lastLogs = await getLastSetLogs(
    db,
    exercises.map((exercise) => exercise.id)
  );
  const session = await getSessionForDate(db, routineId, date);
  const savedLogs = session ? await getSessionLogs(db, session.id) : new Map();

  return { exercises, lastLogs, session, savedLogs };
}

/**
 * Sugerencias de progresión: si en las últimas `weeks` semanas todas las
 * series de un ejercicio fueron con el mismo peso y llegaron al máximo de
 * repeticiones, se sugiere subir el peso un salto (weight_step).
 *
 * Devuelve un Map exerciseId -> peso sugerido (solo los ejercicios que
 * cumplen la regla). `now` se puede pasar para testear.
 */
export async function getProgressionSuggestions(
  db,
  exercises = [],
  weeks = 2,
  now = new Date()
) {
  const suggestions = new Map();
  if (exercises.length === 0) return suggestions;

  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - Number(weeks) * 7);
  const cutoff = [
    cutoffDate.getFullYear(),
    String(cutoffDate.getMonth() + 1).padStart(2, '0'),
    String(cutoffDate.getDate()).padStart(2, '0'),
  ].join('-');

  for (const exercise of exercises) {
    const logs = await db.getAllAsync(
      `SELECT sl.weight, sl.reps
       FROM set_logs sl
       INNER JOIN workout_sessions ws ON ws.id = sl.session_id
       WHERE sl.exercise_id = ? AND ws.session_date >= ?
       ORDER BY ws.session_date ASC, ws.id ASC, sl.set_number ASC;`,
      [exercise.id, cutoff]
    );
    if (!logs || logs.length === 0) continue;

    const latestWeight = Number(logs[logs.length - 1].weight);
    const hitMaxEverywhere = logs.every(
      (entry) =>
        Number(entry.weight) === latestWeight &&
        Number(entry.reps) >= Number(exercise.max_reps)
    );

    if (hitMaxEverywhere) {
      const step = Number(exercise.weight_step) || 2.5;
      suggestions.set(
        Number(exercise.id),
        Math.round((latestWeight + step) * 100) / 100
      );
    }
  }

  return suggestions;
}

/**
 * Guarda la sesión completa del día. Si ya existía una sesión para esa fecha,
 * reemplaza las series de los ejercicios enviados sin tocar el resto.
 */
export async function saveWorkout(
  db,
  { routineId, date, entries, completedAt }
) {
  if (!ISO_DATE_RE.test(String(date))) {
    throw new Error('La fecha del entrenamiento no es válida.');
  }

  const routine = await db.getFirstAsync('SELECT id FROM routines WHERE id = ?;', [
    routineId,
  ]);
  if (!routine) {
    throw new Error('Ese día ya no existe.');
  }

  const cleanEntries = normalizeWorkoutEntries(entries);
  const now = completedAt || new Date().toISOString();

  let summary = null;

  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync(
      'SELECT id FROM workout_sessions WHERE routine_id = ? AND session_date = ?;',
      [routineId, date]
    );

    let sessionId = existing?.id;
    if (!sessionId) {
      const result = await db.runAsync(
        'INSERT INTO workout_sessions (routine_id, session_date) VALUES (?, ?);',
        [routineId, date]
      );
      sessionId = result.lastInsertRowId;
    }

    let setCount = 0;
    let volume = 0;

    for (const entry of cleanEntries) {
      await db.runAsync(
        'DELETE FROM set_logs WHERE session_id = ? AND exercise_id = ?;',
        [sessionId, entry.exerciseId]
      );

      for (let index = 0; index < entry.sets.length; index += 1) {
        const set = entry.sets[index];
        await db.runAsync(
          `INSERT INTO set_logs
           (session_id, exercise_id, set_number, weight, reps, completed_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [sessionId, entry.exerciseId, index + 1, set.weight, set.reps, now]
        );
        setCount += 1;
        volume += set.weight * set.reps;
      }
    }

    summary = {
      sessionId: Number(sessionId),
      setCount,
      exerciseCount: cleanEntries.length,
      volume: Math.round(volume),
    };
  });

  return summary;
}
