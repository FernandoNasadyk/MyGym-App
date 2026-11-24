/**
 * Días de entrenamiento (tabla routines): alta, edición, baja y orden.
 *
 * Un día se asocia a un día de la semana mediante `day_code` (LUN, MIE, ...)
 * o es un día extra (EXTRA, EXTRA2, ...). El código es único: hay como máximo
 * un día por día de la semana.
 */
import {
  WEEKDAY_CODES,
  getDayLabel,
  getTodayCode,
  isExtraCode,
  WEEKDAY_LABELS,
} from '../constants/weekdays.js';

const NAME_MAX_LENGTH = 40;

function normalizeName(name) {
  const clean = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) {
    throw new Error('Escribí un nombre para el día.');
  }
  if (clean.length > NAME_MAX_LENGTH) {
    throw new Error(
      `El nombre del día no puede superar los ${NAME_MAX_LENGTH} caracteres.`
    );
  }
  return clean;
}

function normalizeRequestedCode(dayCode) {
  const code = String(dayCode ?? '').trim().toUpperCase();
  if (code === 'EXTRA') return 'EXTRA';
  if (WEEKDAY_CODES.includes(code)) return code;
  throw new Error('Elegí un día de la semana o "Extra".');
}

async function getNextExtraCode(db) {
  const rows = await db.getAllAsync(
    "SELECT day_code FROM routines WHERE day_code LIKE 'EXTRA%';"
  );
  const used = new Set(rows.map((row) => String(row.day_code)));

  if (!used.has('EXTRA')) return 'EXTRA';
  let index = 2;
  while (used.has(`EXTRA${index}`)) index += 1;
  return `EXTRA${index}`;
}

async function assertWeekdayFree(db, dayCode, ignoreRoutineId = null) {
  const row =
    ignoreRoutineId == null
      ? await db.getFirstAsync(
          'SELECT id FROM routines WHERE day_code = ?;',
          [dayCode]
        )
      : await db.getFirstAsync(
          'SELECT id FROM routines WHERE day_code = ? AND id <> ?;',
          [dayCode, ignoreRoutineId]
        );

  if (row) {
    throw new Error(
      `Ya tenés un día para ${WEEKDAY_LABELS[dayCode]}. Editá ese día o elegí otro.`
    );
  }
}

async function resolveCodeForCreate(db, dayCode) {
  const requested = normalizeRequestedCode(dayCode);

  if (requested === 'EXTRA') {
    return { dayCode: await getNextExtraCode(db), isExtra: 1 };
  }

  await assertWeekdayFree(db, requested);
  return { dayCode: requested, isExtra: 0 };
}

async function resolveCodeForUpdate(db, routine, dayCode) {
  if (dayCode == null) {
    return {
      dayCode: routine.day_code,
      isExtra: isExtraCode(routine.day_code) ? 1 : 0,
    };
  }

  const requested = normalizeRequestedCode(dayCode);

  if (requested === 'EXTRA') {
    if (isExtraCode(routine.day_code)) {
      return { dayCode: routine.day_code, isExtra: 1 };
    }
    return { dayCode: await getNextExtraCode(db), isExtra: 1 };
  }

  await assertWeekdayFree(db, requested, routine.id);
  return { dayCode: requested, isExtra: 0 };
}

async function renumberRoutines(db) {
  const rows = await db.getAllAsync(
    'SELECT id FROM routines ORDER BY sort_order ASC, id ASC;'
  );

  for (let index = 0; index < rows.length; index += 1) {
    await db.runAsync('UPDATE routines SET sort_order = ? WHERE id = ?;', [
      index + 1,
      rows[index].id,
    ]);
  }
}

/** Todos los días con cantidad de ejercicios y última sesión. */
export async function getRoutines(db) {
  return db.getAllAsync(`
    SELECT
      r.*,
      COUNT(DISTINCT e.id) AS exercise_count,
      (
        SELECT COUNT(*)
        FROM workout_sessions ws
        WHERE ws.routine_id = r.id
      ) AS session_count,
      (
        SELECT MAX(ws.session_date)
        FROM workout_sessions ws
        WHERE ws.routine_id = r.id
          AND EXISTS (
            SELECT 1 FROM set_logs sl WHERE sl.session_id = ws.id
          )
      ) AS last_session_date
    FROM routines r
    LEFT JOIN routine_exercises re
      ON re.routine_id = r.id
    LEFT JOIN exercises e
      ON e.id = re.exercise_id AND e.is_active = 1
    GROUP BY r.id
    ORDER BY r.sort_order ASC, r.id ASC;
  `);
}

export async function getRoutineById(db, routineId) {
  return db.getFirstAsync('SELECT * FROM routines WHERE id = ?;', [routineId]);
}

export async function getRoutineByCode(db, dayCode) {
  return db.getFirstAsync('SELECT * FROM routines WHERE day_code = ?;', [
    dayCode,
  ]);
}

/** El día de rutina que corresponde a hoy (o null si hoy es descanso). */
export async function getTodayRoutine(db, date = new Date()) {
  return getRoutineByCode(db, getTodayCode(date));
}

export async function createRoutine(db, { name, dayCode }) {
  const cleanName = normalizeName(name);
  const resolved = await resolveCodeForCreate(db, dayCode);

  const orderRow = await db.getFirstAsync(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM routines;'
  );
  const nextOrder = Number(orderRow?.next_order) || 1;

  const result = await db.runAsync(
    `INSERT INTO routines (name, day_code, is_extra, sort_order, warmup)
     VALUES (?, ?, ?, ?, '');`,
    [cleanName, resolved.dayCode, resolved.isExtra, nextOrder]
  );

  return { id: result.lastInsertRowId, dayCode: resolved.dayCode };
}

export async function updateRoutine(db, routineId, { name, dayCode }) {
  const routine = await getRoutineById(db, routineId);
  if (!routine) {
    throw new Error('Ese día ya no existe.');
  }

  const cleanName = normalizeName(name);
  const resolved = await resolveCodeForUpdate(db, routine, dayCode);

  await db.runAsync(
    'UPDATE routines SET name = ?, day_code = ?, is_extra = ? WHERE id = ?;',
    [cleanName, resolved.dayCode, resolved.isExtra, routineId]
  );

  return { dayCode: resolved.dayCode };
}

/**
 * Borra un día. Solo se permite si no tiene sesiones registradas, para no
 * perder historial.
 */
export async function deleteRoutine(db, routineId) {
  const sessions = await db.getFirstAsync(
    'SELECT COUNT(*) AS total FROM workout_sessions WHERE routine_id = ?;',
    [routineId]
  );

  if (Number(sessions?.total) > 0) {
    throw new Error(
      'Ese día tiene sesiones registradas. No se puede eliminar sin borrar el historial.'
    );
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM routines WHERE id = ?;', [routineId]);
    await renumberRoutines(db);
  });
}

/** Mueve un día una posición arriba ('up') o abajo ('down'). */
export async function moveRoutine(db, routineId, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`Dirección inválida: ${direction}`);
  }

  const rows = await db.getAllAsync(
    'SELECT id FROM routines ORDER BY sort_order ASC, id ASC;'
  );
  const index = rows.findIndex((row) => Number(row.id) === Number(routineId));
  if (index < 0) return false;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return false;

  const reordered = rows.slice();
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await db.withTransactionAsync(async () => {
    for (let position = 0; position < reordered.length; position += 1) {
      await db.runAsync('UPDATE routines SET sort_order = ? WHERE id = ?;', [
        position + 1,
        reordered[position].id,
      ]);
    }
  });

  return true;
}

/** Etiqueta del día ("Miércoles", "Extra") para usar en la UI. */
export function describeRoutine(routine) {
  return getDayLabel(routine?.day_code);
}

export { getTodayCode };
