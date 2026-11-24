/**
 * Entrenamiento guiado del día: datos para armar los borradores de series y
 * guardado de la sesión completa.
 *
 * No importa expo-sqlite para poder testearse con node:sqlite.
 */
import { getDayExercises } from './day-exercises.js';
import { RIR_OPTIONS, WEIGHT_STEP } from '../constants/training.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseWeight(value) {
  if (value === '' || value == null) return 0;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * RIR de un ejercicio: vacío/null = no se usó RIR; si se usó, tiene que ser
 * 1, 2 o 3.
 */
function normalizeRir(value) {
  if (value === '' || value == null) return null;
  const rir = Number(value);
  if (!Number.isInteger(rir) || !RIR_OPTIONS.includes(rir)) {
    throw new Error('El RIR tiene que ser 1, 2 o 3.');
  }
  return rir;
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
      normalized.push({ exerciseId, sets, rir: normalizeRir(entry?.rir) });
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
 * Si se pasa `beforeDate` (YYYY-MM-DD), solo se consideran sesiones de fechas
 * anteriores: así la referencia es siempre la última sesión *previa* y no la
 * que se está cargando hoy.
 * Devuelve un Map exerciseId -> [{ setNumber, weight, reps, rir, date }].
 */
export async function getLastSetLogs(db, exerciseIds = [], beforeDate = null) {
  const ids = exerciseIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => '?').join(', ');
  const dateFilter = beforeDate ? 'AND ws2.session_date < ?' : '';
  const dateFilterOuter = beforeDate ? 'AND ws.session_date < ?' : '';
  const params = beforeDate ? [...ids, beforeDate, beforeDate] : ids;

  const rows = await db.getAllAsync(
    `SELECT sl.exercise_id, sl.set_number, sl.weight, sl.reps, sl.rir,
            ws.session_date
     FROM set_logs sl
     INNER JOIN workout_sessions ws ON ws.id = sl.session_id
     WHERE sl.exercise_id IN (${placeholders})
       ${dateFilterOuter}
       AND ws.id = (
         SELECT ws2.id
         FROM workout_sessions ws2
         INNER JOIN set_logs sl2 ON sl2.session_id = ws2.id
         WHERE sl2.exercise_id = sl.exercise_id ${dateFilter}
         ORDER BY ws2.session_date DESC, ws2.id DESC
         LIMIT 1
       )
     ORDER BY sl.exercise_id ASC, sl.set_number ASC;`,
    params
  );

  const map = new Map();
  for (const row of rows) {
    const exerciseId = Number(row.exercise_id);
    if (!map.has(exerciseId)) map.set(exerciseId, []);
    map.get(exerciseId).push({
      setNumber: Number(row.set_number),
      weight: Number(row.weight),
      reps: Number(row.reps),
      rir: row.rir == null ? null : Number(row.rir),
      date: String(row.session_date),
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
    `SELECT exercise_id, set_number, weight, reps, rir
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
      rir: row.rir == null ? null : Number(row.rir),
    });
  }
  return map;
}

/**
 * Datos completos para armar la pantalla de entrenamiento.
 */
export async function getWorkoutData(db, routineId, date) {
  const exercises = await getDayExercises(db, routineId);
  // La referencia es la última sesión previa a la fecha que se está cargando.
  const lastLogs = await getLastSetLogs(
    db,
    exercises.map((exercise) => exercise.id),
    date
  );
  const session = await getSessionForDate(db, routineId, date);
  const savedLogs = session ? await getSessionLogs(db, session.id) : new Map();

  return { exercises, lastLogs, session, savedLogs };
}

function toISODateLocal(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Días enteros entre dos fechas ISO (YYYY-MM-DD), sin efectos de horario. */
function daysBetween(fromIso, toIso) {
  const toDay = (iso) => {
    const [year, month, day] = iso.split('-').map(Number);
    return Math.round(Date.UTC(year, month - 1, day) / 86400000);
  };
  return toDay(toIso) - toDay(fromIso);
}

/**
 * Sugerencias de progresión.
 *
 * Se sugiere subir el peso (un salto fijo de WEIGHT_STEP kg) solo cuando se
 * cumplen las dos condiciones:
 *
 * 1. Período cumplido: desde la primera sesión con el peso actual (con todas
 *    sus series a ese peso) pasaron al menos `weeks` semanas (7 días cada una)
 *    hasta hoy. Si se cambia el peso, el período arranca de nuevo.
 * 2. Repeticiones: en las últimas `weeks` semanas hay al menos una sesión y
 *    todas sus series, con el mismo peso, llegaron al máximo de repeticiones
 *    del ejercicio.
 *
 * Así, terminar una sesión alcanzando el máximo no dispara el aviso hasta que
 * transcurre la ventana elegida (1 o 2 semanas).
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

  const windowWeeks = Number(weeks) > 0 ? Number(weeks) : 2;
  const windowDays = windowWeeks * 7;

  const today = toISODateLocal(now);
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - windowDays);
  const cutoff = toISODateLocal(cutoffDate);

  for (const exercise of exercises) {
    const logs = await db.getAllAsync(
      `SELECT ws.id AS session_id, ws.session_date, sl.weight, sl.reps
       FROM set_logs sl
       INNER JOIN workout_sessions ws ON ws.id = sl.session_id
       WHERE sl.exercise_id = ?
       ORDER BY ws.session_date ASC, ws.id ASC, sl.set_number ASC;`,
      [exercise.id]
    );
    if (!logs || logs.length === 0) continue;

    // Sesiones en orden cronológico, cada una con sus series.
    const sessions = [];
    for (const row of logs) {
      const last = sessions[sessions.length - 1];
      if (last && last.id === Number(row.session_id)) {
        last.sets.push(row);
      } else {
        sessions.push({
          id: Number(row.session_id),
          date: String(row.session_date),
          sets: [row],
        });
      }
    }

    // Tramo actual: las sesiones más recientes en las que todas las series
    // se hicieron con el peso actual.
    const latestWeight = Number(logs[logs.length - 1].weight);
    const run = [];
    for (let index = sessions.length - 1; index >= 0; index -= 1) {
      const allAtWeight = sessions[index].sets.every(
        (entry) => Number(entry.weight) === latestWeight
      );
      if (!allAtWeight) break;
      run.unshift(sessions[index]);
    }
    if (run.length === 0) continue;

    // 1) ¿Ya pasó el período desde que empezó con este peso?
    if (daysBetween(run[0].date, today) < windowDays) continue;

    // 2) ¿Llegó al máximo de repeticiones en todo el período?
    const inWindow = run.filter((session) => session.date >= cutoff);
    if (inWindow.length === 0) continue;

    const hitMaxEverywhere = inWindow.every((session) =>
      session.sets.every(
        (entry) => Number(entry.reps) >= Number(exercise.max_reps)
      )
    );

    if (hitMaxEverywhere) {
      suggestions.set(
        Number(exercise.id),
        Math.round((latestWeight + WEIGHT_STEP) * 100) / 100
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
           (session_id, exercise_id, set_number, weight, reps, rir, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            sessionId,
            entry.exerciseId,
            index + 1,
            set.weight,
            set.reps,
            entry.rir,
            now,
          ]
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
