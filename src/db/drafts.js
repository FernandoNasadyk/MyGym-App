/**
 * Borrador de la sesión en curso.
 *
 * Mientras se carga la rutina del día se guarda en SQLite lo que hay en
 * pantalla (pesos, repeticiones y RIR), así que si la app se cierra por
 * completo se recupera al volver a abrirla. `saveWorkout` borra el borrador
 * en la misma transacción en la que guarda la sesión.
 *
 * No importa expo-sqlite para poder testearse con node:sqlite.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SETS = 20;
const MAX_FIELD_LENGTH = 12;

function cleanField(value) {
  return String(value ?? '').slice(0, MAX_FIELD_LENGTH);
}

/**
 * Arma el JSON del borrador solo con los ejercicios que se muestran.
 * { exercises: { [exerciseId]: { sets: [{ weight, reps }], rir } } }
 */
export function buildDraftPayload(exercises = [], drafts = {}, rirByExercise = {}) {
  const payload = { exercises: {} };

  for (const exercise of exercises) {
    const sets = drafts[exercise.id];
    if (!Array.isArray(sets)) continue;

    const rir = rirByExercise[exercise.id];
    payload.exercises[exercise.id] = {
      sets: sets.slice(0, MAX_SETS).map((set) => ({
        weight: cleanField(set?.weight),
        reps: cleanField(set?.reps),
      })),
      rir: [1, 2, 3].includes(rir) ? rir : null,
    };
  }

  return payload;
}

/** Guarda (o actualiza) el borrador de ese día y esa fecha. */
export async function saveWorkoutDraft(db, { routineId, date, payload }) {
  if (!ISO_DATE_RE.test(String(date))) return;

  await db.runAsync(
    `INSERT INTO workout_drafts (routine_id, session_date, payload, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (routine_id, session_date)
     DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;`,
    [routineId, date, JSON.stringify(payload), new Date().toISOString()]
  );
}

/** Borrador guardado o null (también si el contenido está dañado). */
export async function getWorkoutDraft(db, routineId, date) {
  const row = await db.getFirstAsync(
    'SELECT payload FROM workout_drafts WHERE routine_id = ? AND session_date = ?;',
    [routineId, date]
  );
  if (!row) return null;

  try {
    const parsed = JSON.parse(row.payload);
    if (!parsed || typeof parsed.exercises !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearWorkoutDraft(db, routineId, date) {
  await db.runAsync(
    'DELETE FROM workout_drafts WHERE routine_id = ? AND session_date = ?;',
    [routineId, date]
  );
}

/** Borra borradores de días anteriores a `minDate` (YYYY-MM-DD). */
export async function deleteStaleDrafts(db, minDate) {
  if (!ISO_DATE_RE.test(String(minDate))) return;
  await db.runAsync('DELETE FROM workout_drafts WHERE session_date < ?;', [
    minDate,
  ]);
}

/**
 * Aplica un borrador sobre los borradores iniciales de pantalla. Solo toca
 * ejercicios que siguen en la rutina y respeta los demás tal como están.
 * Devuelve { drafts, rirByExercise, restored } (restored = hubo algo para
 * recuperar).
 */
export function applyDraftPayload(exercises = [], drafts = {}, rirByExercise = {}, payload) {
  const nextDrafts = { ...drafts };
  const nextRir = { ...rirByExercise };
  let restored = false;

  for (const exercise of exercises) {
    const saved = payload?.exercises?.[exercise.id];
    if (!saved || !Array.isArray(saved.sets) || saved.sets.length === 0) continue;

    nextDrafts[exercise.id] = saved.sets.slice(0, MAX_SETS).map((set) => ({
      weight: cleanField(set?.weight),
      reps: cleanField(set?.reps),
    }));
    nextRir[exercise.id] = [1, 2, 3].includes(saved.rir) ? saved.rir : null;
    restored = true;
  }

  return { drafts: nextDrafts, rirByExercise: nextRir, restored };
}
