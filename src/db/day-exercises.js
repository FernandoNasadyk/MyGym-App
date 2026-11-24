/**
 * Capa de datos de "ejercicios por día" (tabla routine_exercises) y del
 * catálogo de ejercicios.
 *
 * Todas las funciones reciben la instancia de base de datos como primer
 * argumento y no importan expo-sqlite, así que se pueden probar con
 * node:sqlite (ver scripts/test-db.mjs).
 */

const MAX_NAME_LENGTH = 80;

function toInt(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toFloat(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Valida y normaliza los datos de un ejercicio.
 * Lanza un Error con un mensaje listo para mostrar al usuario.
 */
export function normalizeExerciseInput(input = {}) {
  const name = String(input.name ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name) {
    throw new Error('Escribí el nombre del ejercicio.');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(
      `El nombre no puede superar los ${MAX_NAME_LENGTH} caracteres.`
    );
  }

  const defaultSets = toInt(input.defaultSets);
  if (!Number.isInteger(defaultSets) || defaultSets < 1 || defaultSets > 20) {
    throw new Error(
      'Las series por defecto tienen que ser un número entre 1 y 20.'
    );
  }

  const minReps = toInt(input.minReps);
  if (!Number.isInteger(minReps) || minReps < 1 || minReps > 100) {
    throw new Error(
      'El mínimo de repeticiones tiene que ser un número entre 1 y 100.'
    );
  }

  const maxReps = toInt(input.maxReps);
  if (!Number.isInteger(maxReps) || maxReps < 1 || maxReps > 100) {
    throw new Error(
      'El máximo de repeticiones tiene que ser un número entre 1 y 100.'
    );
  }

  if (minReps > maxReps) {
    throw new Error(
      'El mínimo de repeticiones no puede ser mayor que el máximo.'
    );
  }

  // Peso inicial: opcional. Vacío = 0 (sin peso inicial definido).
  const rawInitialWeight = String(input.initialWeight ?? '').trim();
  const initialWeight = rawInitialWeight === '' ? 0 : toFloat(rawInitialWeight);
  if (
    !Number.isFinite(initialWeight) ||
    initialWeight < 0 ||
    initialWeight > 1000
  ) {
    throw new Error(
      'El peso inicial tiene que ser un número entre 0 y 1000 kg (por ejemplo 20 o 42,5).'
    );
  }

  return {
    name,
    defaultSets,
    minReps,
    maxReps,
    initialWeight: Math.round(initialWeight * 100) / 100,
  };
}

/** Ejercicios activos asignados a un día, en el orden en que se entrenan. */
export async function getDayExercises(db, routineId) {
  return db.getAllAsync(
    `SELECT e.*, re.sort_order AS sort_order
     FROM exercises e
     INNER JOIN routine_exercises re ON re.exercise_id = e.id
     WHERE re.routine_id = ? AND e.is_active = 1
     ORDER BY re.sort_order ASC, re.id ASC;`,
    [routineId]
  );
}

/** Ejercicios activos del catálogo que todavía no están en ese día. */
export async function getExercisesOutsideDay(db, routineId) {
  return db.getAllAsync(
    `SELECT e.*
     FROM exercises e
     WHERE e.is_active = 1
       AND e.id NOT IN (
         SELECT exercise_id FROM routine_exercises WHERE routine_id = ?
       )
     ORDER BY e.name COLLATE NOCASE ASC;`,
    [routineId]
  );
}

/** Mapa routineId -> nombres de sus ejercicios, en el orden del día. */
export async function getRoutineExerciseNames(db) {
  const rows = await db.getAllAsync(
    `SELECT re.routine_id, e.name
     FROM routine_exercises re
     INNER JOIN exercises e ON e.id = re.exercise_id
     WHERE e.is_active = 1
     ORDER BY re.routine_id ASC, re.sort_order ASC, re.id ASC;`
  );

  const map = new Map();
  for (const row of rows) {
    const routineId = Number(row.routine_id);
    if (!map.has(routineId)) {
      map.set(routineId, []);
    }
    map.get(routineId).push(row.name);
  }
  return map;
}

/** Mapa exerciseId -> Set de routineIds, para pintar los chips del catálogo. */
export async function getAssignedMap(db) {
  const rows = await db.getAllAsync(
    'SELECT routine_id, exercise_id FROM routine_exercises;'
  );

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.exercise_id)) {
      map.set(row.exercise_id, new Set());
    }
    map.get(row.exercise_id).add(row.routine_id);
  }
  return map;
}

async function renumberDay(db, routineId) {
  const rows = await db.getAllAsync(
    `SELECT id
     FROM routine_exercises
     WHERE routine_id = ?
     ORDER BY sort_order ASC, id ASC;`,
    [routineId]
  );

  for (let index = 0; index < rows.length; index += 1) {
    await db.runAsync(
      'UPDATE routine_exercises SET sort_order = ? WHERE id = ?;',
      [index + 1, rows[index].id]
    );
  }
}

/** Numera 1..n un día sin cambiar el orden visible (arregla huecos/empates). */
export async function normalizeDayOrder(db, routineId) {
  await db.withTransactionAsync(async () => {
    await renumberDay(db, routineId);
  });
}

/** Numera todos los días. Es idempotente: se puede correr en cada arranque. */
export async function normalizeAllDayOrders(db) {
  const routines = await db.getAllAsync('SELECT id FROM routines;');

  await db.withTransactionAsync(async () => {
    for (const routine of routines) {
      await renumberDay(db, routine.id);
    }
  });
}

/**
 * Suma un ejercicio al final del día.
 * Devuelve la posición asignada o null si ya estaba asignado.
 */
export async function appendExerciseToDay(db, routineId, exerciseId) {
  const nextRow = await db.getFirstAsync(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
     FROM routine_exercises
     WHERE routine_id = ?;`,
    [routineId]
  );
  const nextOrder = Number(nextRow?.next_order) || 1;

  const result = await db.runAsync(
    `INSERT OR IGNORE INTO routine_exercises (routine_id, exercise_id, sort_order)
     VALUES (?, ?, ?);`,
    [routineId, exerciseId, nextOrder]
  );

  return result?.changes > 0 ? nextOrder : null;
}

/** Quita un ejercicio del día y vuelve a numerar el resto. */
export async function removeExerciseFromDay(db, routineId, exerciseId) {
  let removed = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'DELETE FROM routine_exercises WHERE routine_id = ? AND exercise_id = ?;',
      [routineId, exerciseId]
    );
    removed = result?.changes ?? 0;
    await renumberDay(db, routineId);
  });

  return removed > 0;
}

/**
 * Mueve un ejercicio una posición arriba ('up') o abajo ('down').
 * Devuelve true si el orden cambió.
 */
export async function moveExerciseInDay(
  db,
  routineId,
  exerciseId,
  direction
) {
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`Dirección inválida: ${direction}`);
  }

  const rows = await db.getAllAsync(
    `SELECT id, exercise_id
     FROM routine_exercises
     WHERE routine_id = ?
     ORDER BY sort_order ASC, id ASC;`,
    [routineId]
  );

  const index = rows.findIndex(
    (row) => Number(row.exercise_id) === Number(exerciseId)
  );
  if (index < 0) return false;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return false;

  const reordered = rows.slice();
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await db.withTransactionAsync(async () => {
    for (let position = 0; position < reordered.length; position += 1) {
      await db.runAsync(
        'UPDATE routine_exercises SET sort_order = ? WHERE id = ?;',
        [position + 1, reordered[position].id]
      );
    }
  });

  return true;
}

async function assertNameAvailable(db, name, ignoreId = null) {
  const row =
    ignoreId == null
      ? await db.getFirstAsync(
          'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?);',
          [name]
        )
      : await db.getFirstAsync(
          'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?) AND id <> ?;',
          [name, ignoreId]
        );

  if (row) {
    throw new Error(`Ya existe un ejercicio llamado "${name}".`);
  }
}

/**
 * Crea un ejercicio en el catálogo.
 * Si el nombre pertenecía a un ejercicio dado de baja, lo reactiva.
 */
export async function createExercise(db, input) {
  const data = normalizeExerciseInput(input);

  const existing = await db.getFirstAsync(
    'SELECT id, is_active FROM exercises WHERE LOWER(name) = LOWER(?);',
    [data.name]
  );

  if (existing?.is_active === 1) {
    throw new Error(
      `"${data.name}" ya está en el catálogo. Usá "Editar" para modificarlo.`
    );
  }

  if (existing) {
    await db.runAsync(
      `UPDATE exercises
       SET name = ?, default_sets = ?, min_reps = ?, max_reps = ?, initial_weight = ?, is_active = 1
       WHERE id = ?;`,
      [
        data.name,
        data.defaultSets,
        data.minReps,
        data.maxReps,
        data.initialWeight,
        existing.id,
      ]
    );
    return { id: existing.id, reactivated: true };
  }

  const result = await db.runAsync(
    `INSERT INTO exercises
     (name, default_sets, min_reps, max_reps, initial_weight, is_active)
     VALUES (?, ?, ?, ?, ?, 1);`,
    [
      data.name,
      data.defaultSets,
      data.minReps,
      data.maxReps,
      data.initialWeight,
    ]
  );

  return { id: result.lastInsertRowId, reactivated: false };
}

/** Actualiza los datos de un ejercicio sin tocar su historial de series. */
export async function updateExercise(db, exerciseId, input) {
  const data = normalizeExerciseInput(input);
  await assertNameAvailable(db, data.name, exerciseId);

  await db.runAsync(
    `UPDATE exercises
     SET name = ?, default_sets = ?, min_reps = ?, max_reps = ?, initial_weight = ?
     WHERE id = ?;`,
    [
      data.name,
      data.defaultSets,
      data.minReps,
      data.maxReps,
      data.initialWeight,
      exerciseId,
    ]
  );
}

/**
 * Da de baja un ejercicio: lo saca de todos los días y lo oculta del catálogo
 * sin borrar el historial de series ya registradas.
 */
export async function deactivateExercise(db, exerciseId) {
  const links = await db.getAllAsync(
    'SELECT DISTINCT routine_id FROM routine_exercises WHERE exercise_id = ?;',
    [exerciseId]
  );

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM routine_exercises WHERE exercise_id = ?;',
      [exerciseId]
    );
    await db.runAsync('UPDATE exercises SET is_active = 0 WHERE id = ?;', [
      exerciseId,
    ]);

    for (const link of links) {
      await renumberDay(db, link.routine_id);
    }
  });
}
