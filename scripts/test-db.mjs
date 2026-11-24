/**
 * Tests de la capa de datos (orden de ejercicios por día, catálogo y
 * validaciones) usando node:sqlite, sin emulador ni Expo.
 *
 * Correr con: npm run test:db
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from '../src/db/schema.js';
import {
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  summarizeBackup,
} from '../src/db/backup.js';
import { WEIGHT_STEP } from '../src/constants/training.js';
import {
  appendExerciseToDay,
  createExercise,
  deactivateExercise,
  getAssignedMap,
  getDayExercises,
  getExercisesOutsideDay,
  getRoutineExerciseNames,
  moveExerciseInDay,
  normalizeAllDayOrders,
  normalizeExerciseInput,
  removeExerciseFromDay,
  updateExercise,
} from '../src/db/day-exercises.js';
import {
  countSessions,
  getExerciseFilterOptions,
  getHistoryTotals,
  getRecentSessions,
  summarizeSessions,
} from '../src/db/history.js';
import {
  getProgressionSuggestions,
  getSessionForDate,
  getWorkoutData,
  saveWorkout,
} from '../src/db/workout.js';
import {
  createRoutine,
  deleteRoutine,
  getTodayRoutine,
  updateRoutine,
} from '../src/db/routines.js';
import {
  addSet,
  adjustWeight,
  buildInitialCollapsed,
  buildInitialDrafts,
  buildInitialRir,
  buildWorkoutEntries,
  countCompleted,
  describeLastSets,
  isWorkoutComplete,
  removeLastSet,
  sanitizeRepsInput,
  sanitizeWeightInput,
} from '../src/utils/workout-draft.js';
import {
  formatDateShort,
  formatInitialWeight,
  formatNumber,
  formatRelativeDate,
  formatWeight,
  getDateBadgeParts,
} from '../src/utils/format.js';

/**
 * Adaptador mínimo con la misma API async que usa expo-sqlite
 * (execAsync / runAsync / getAllAsync / getFirstAsync / withTransactionAsync).
 */
function createAdapter() {
  const raw = new DatabaseSync(':memory:');
  const bind = (params) => {
    if (Array.isArray(params)) return params;
    if (params == null) return [];
    return [params];
  };

  return {
    raw,
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params) {
      const result = raw.prepare(sql).run(...bind(params));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async getAllAsync(sql, params) {
      return raw.prepare(sql).all(...bind(params));
    },
    async getFirstAsync(sql, params) {
      const row = raw.prepare(sql).get(...bind(params));
      return row === undefined ? null : row;
    },
    async withTransactionAsync(task) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

async function freshDb() {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await db.runAsync(
    "INSERT INTO routines (name, day_code, is_extra, sort_order) VALUES ('Lunes', 'LUN', 0, 1);"
  );
  await db.runAsync(
    "INSERT INTO routines (name, day_code, is_extra, sort_order) VALUES ('Miércoles', 'MIE', 0, 2);"
  );
  return db;
}

async function addExercise(db, name, overrides = {}) {
  const { id } = await createExercise(db, {
    name,
    defaultSets: 2,
    minReps: 6,
    maxReps: 10,
    initialWeight: 0,
    ...overrides,
  });
  return id;
}

async function orderOf(db, routineId) {
  const rows = await db.getAllAsync(
    `SELECT exercise_id
     FROM routine_exercises
     WHERE routine_id = ?
     ORDER BY sort_order ASC, id ASC;`,
    [routineId]
  );
  return rows.map((row) => Number(row.exercise_id));
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('agregar ejercicios los pone al final, sin duplicados', async () => {
  const db = await freshDb();
  const bench = await addExercise(db, 'Press banca');
  const row = await addExercise(db, 'Remo con barra');
  const squat = await addExercise(db, 'Sentadilla');

  assert.equal(await appendExerciseToDay(db, 1, bench), 1);
  assert.equal(await appendExerciseToDay(db, 1, row), 2);
  assert.equal(await appendExerciseToDay(db, 1, squat), 3);
  assert.equal(await appendExerciseToDay(db, 1, row), null);

  assert.deepEqual(await orderOf(db, 1), [bench, row, squat]);
});

test('mover arriba/abajo cambia el orden y respeta los extremos', async () => {
  const db = await freshDb();
  const a = await addExercise(db, 'A');
  const b = await addExercise(db, 'B');
  const c = await addExercise(db, 'C');
  for (const id of [a, b, c]) await appendExerciseToDay(db, 1, id);

  assert.equal(await moveExerciseInDay(db, 1, c, 'up'), true);
  assert.deepEqual(await orderOf(db, 1), [a, c, b]);

  assert.equal(await moveExerciseInDay(db, 1, c, 'up'), true);
  assert.deepEqual(await orderOf(db, 1), [c, a, b]);

  // Ya está primero: no cambia nada
  assert.equal(await moveExerciseInDay(db, 1, c, 'up'), false);
  assert.deepEqual(await orderOf(db, 1), [c, a, b]);

  assert.equal(await moveExerciseInDay(db, 1, c, 'down'), true);
  assert.deepEqual(await orderOf(db, 1), [a, c, b]);

  // Ya está último
  assert.equal(await moveExerciseInDay(db, 1, b, 'down'), false);
  assert.deepEqual(await orderOf(db, 1), [a, c, b]);

  // Mover a la par del final
  assert.equal(await moveExerciseInDay(db, 1, c, 'down'), true);
  assert.deepEqual(await orderOf(db, 1), [a, b, c]);
});

test('el orden visible se mantiene al normalizar sort_order viejos', async () => {
  const db = await freshDb();
  const a = await addExercise(db, 'A');
  const b = await addExercise(db, 'B');
  const c = await addExercise(db, 'C');

  // Órdenes heredados, con huecos y sin relación con el id del ejercicio
  for (const [id, sortOrder] of [
    [a, 50],
    [b, 10],
    [c, 30],
  ]) {
    await db.runAsync(
      'INSERT INTO routine_exercises (routine_id, exercise_id, sort_order) VALUES (1, ?, ?);',
      [id, sortOrder]
    );
  }

  await normalizeAllDayOrders(db);

  const rows = await db.getAllAsync(
    `SELECT exercise_id, sort_order
     FROM routine_exercises
     WHERE routine_id = 1
     ORDER BY sort_order ASC;`
  );
  assert.deepEqual(
    rows.map((row) => Number(row.exercise_id)),
    [b, c, a]
  );
  assert.deepEqual(
    rows.map((row) => Number(row.sort_order)),
    [1, 2, 3]
  );
});

test('mover con sort_order repetidos deja el día numerado 1..n', async () => {
  const db = await freshDb();
  const a = await addExercise(db, 'A');
  const b = await addExercise(db, 'B');
  const c = await addExercise(db, 'C');
  for (const id of [a, b, c]) {
    await db.runAsync(
      'INSERT INTO routine_exercises (routine_id, exercise_id, sort_order) VALUES (1, ?, 1);',
      [id]
    );
  }

  await moveExerciseInDay(db, 1, c, 'up');

  const rows = await db.getAllAsync(
    'SELECT exercise_id, sort_order FROM routine_exercises WHERE routine_id = 1 ORDER BY sort_order ASC, id ASC;'
  );
  assert.deepEqual(
    rows.map((row) => Number(row.sort_order)),
    [1, 2, 3]
  );
});

test('quitar del día renumera y deja el historial intacto', async () => {
  const db = await freshDb();
  const a = await addExercise(db, 'A');
  const b = await addExercise(db, 'B');
  const c = await addExercise(db, 'C');
  for (const id of [a, b, c]) await appendExerciseToDay(db, 1, id);

  // Un registro de serie para comprobar que no se toca
  await db.runAsync(
    "INSERT INTO workout_sessions (routine_id, session_date) VALUES (1, '2026-01-05');"
  );
  await db.runAsync(
    `INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps, completed_at)
     VALUES (1, ?, 1, 40, 10, '2026-01-05T10:00:00.000Z');`,
    [b]
  );

  assert.equal(await removeExerciseFromDay(db, 1, b), true);
  assert.equal(await removeExerciseFromDay(db, 1, b), false);

  assert.deepEqual(await orderOf(db, 1), [a, c]);
  assert.equal(
    (await db.getFirstAsync('SELECT COUNT(*) AS total FROM set_logs;')).total,
    1
  );
  assert.equal(
    (await db.getFirstAsync('SELECT COUNT(*) AS total FROM exercises;')).total,
    3
  );
});

test('la lista del día solo trae activos y en orden', async () => {
  const db = await freshDb();
  const a = await addExercise(db, 'A');
  const b = await addExercise(db, 'B');
  const c = await addExercise(db, 'C');
  for (const id of [a, b, c]) await appendExerciseToDay(db, 1, id);

  const day = await getDayExercises(db, 1);
  assert.deepEqual(
    day.map((row) => row.name),
    ['A', 'B', 'C']
  );
  assert.deepEqual(
    day.map((row) => Number(row.sort_order)),
    [1, 2, 3]
  );

  const outside = await getExercisesOutsideDay(db, 1);
  assert.deepEqual(outside, []);

  await deactivateExercise(db, c);
  const after = await getDayExercises(db, 1);
  assert.deepEqual(
    after.map((row) => row.name),
    ['A', 'B']
  );

  const outsideAfter = await getExercisesOutsideDay(db, 1);
  assert.deepEqual(outsideAfter, []);
});

test('mapa de días asignados por ejercicio', async () => {
  const db = await freshDb();
  const a = await addExercise(db, 'A');
  await appendExerciseToDay(db, 1, a);
  await appendExerciseToDay(db, 2, a);

  const map = await getAssignedMap(db);
  assert.ok(map instanceof Map);
  assert.deepEqual([...map.get(a)].sort(), [1, 2]);
});

test('validación de datos de ejercicio', () => {
  assert.throws(
    () =>
      normalizeExerciseInput({
        name: '   ',
        defaultSets: 2,
        minReps: 6,
        maxReps: 10,
        initialWeight: 0,
      }),
    /nombre/
  );
  assert.throws(
    () =>
      normalizeExerciseInput({
        name: 'Press',
        defaultSets: 0,
        minReps: 6,
        maxReps: 10,
        initialWeight: 0,
      }),
    /series/
  );
  assert.throws(
    () =>
      normalizeExerciseInput({
        name: 'Press',
        defaultSets: 2,
        minReps: 12,
        maxReps: 10,
        initialWeight: 0,
      }),
    /mínimo/
  );
  assert.throws(
    () =>
      normalizeExerciseInput({
        name: 'Press',
        defaultSets: 2,
        minReps: 6,
        maxReps: 10,
        initialWeight: -1,
      }),
    /peso inicial/
  );
  assert.throws(
    () =>
      normalizeExerciseInput({
        name: 'Press',
        defaultSets: 2,
        minReps: 6,
        maxReps: 10,
        initialWeight: 'abc',
      }),
    /peso inicial/
  );

  const normalized = normalizeExerciseInput({
    name: '  Press   banca ',
    defaultSets: '3',
    minReps: '5',
    maxReps: '8',
    initialWeight: '42,5',
  });
  assert.deepEqual(normalized, {
    name: 'Press banca',
    defaultSets: 3,
    minReps: 5,
    maxReps: 8,
    initialWeight: 42.5,
  });

  // El peso inicial es opcional: vacío o ausente = 0 (sin peso inicial)
  assert.equal(
    normalizeExerciseInput({
      name: 'Press',
      defaultSets: 2,
      minReps: 6,
      maxReps: 10,
      initialWeight: '',
    }).initialWeight,
    0
  );
  assert.equal(
    normalizeExerciseInput({
      name: 'Press',
      defaultSets: 2,
      minReps: 6,
      maxReps: 10,
    }).initialWeight,
    0
  );
});

test('no se puede repetir nombre y se puede editar', async () => {
  const db = await freshDb();
  const a = await addExercise(db, 'Press banca');
  const b = await addExercise(db, 'Remo');

  await assert.rejects(
    () =>
      createExercise(db, {
        name: 'press BANCA',
        defaultSets: 2,
        minReps: 6,
        maxReps: 10,
        initialWeight: 0,
      }),
    /ya está en el catálogo/
  );

  await updateExercise(db, b, {
    name: 'Remo con barra',
    defaultSets: 4,
    minReps: 8,
    maxReps: 12,
    initialWeight: 45,
  });

  const updated = await db.getFirstAsync(
    'SELECT * FROM exercises WHERE id = ?',
    [b]
  );
  assert.equal(updated.name, 'Remo con barra');
  assert.equal(Number(updated.default_sets), 4);
  assert.equal(Number(updated.initial_weight), 45);

  await assert.rejects(
    () =>
      updateExercise(db, a, {
        name: 'Remo con barra',
        defaultSets: 2,
        minReps: 6,
        maxReps: 10,
        initialWeight: 0,
      }),
    /Ya existe/
  );
});

test('dar de baja mantiene el ejercicio oculto y se puede reactivar', async () => {
  const db = await freshDb();
  const id = await addExercise(db, 'Press banca');
  await appendExerciseToDay(db, 1, id);

  await deactivateExercise(db, id);

  assert.equal(
    (await db.getFirstAsync('SELECT is_active FROM exercises WHERE id = ?', [
      id,
    ])).is_active,
    0
  );
  assert.deepEqual(await orderOf(db, 1), []);

  const revived = await createExercise(db, {
    name: 'press banca',
    defaultSets: 3,
    minReps: 8,
    maxReps: 12,
    initialWeight: 0,
  });
  assert.equal(revived.reactivated, true);
  assert.equal(revived.id, id);

  const revivedRow = await db.getFirstAsync(
    'SELECT * FROM exercises WHERE id = ?',
    [id]
  );
  assert.equal(Number(revivedRow.is_active), 1);
  assert.equal(Number(revivedRow.default_sets), 3);
  assert.deepEqual(await orderOf(db, 1), []);
});

async function addSession(db, routineId, sessionDate) {
  const result = await db.runAsync(
    'INSERT INTO workout_sessions (routine_id, session_date) VALUES (?, ?);',
    [routineId, sessionDate]
  );
  return Number(result.lastInsertRowId);
}

async function addLog(
  db,
  sessionId,
  exerciseId,
  setNumber,
  weight,
  reps,
  completedAt = '2026-11-14T10:00:00.000Z'
) {
  await db.runAsync(
    `INSERT INTO set_logs
     (session_id, exercise_id, set_number, weight, reps, completed_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [sessionId, exerciseId, setNumber, weight, reps, completedAt]
  );
}

test('el historial agrupa las últimas 6 sesiones con series y volumen', async () => {
  const db = await freshDb();
  const bench = await addExercise(db, 'Press banca');
  const row = await addExercise(db, 'Remo con barra');
  const squat = await addExercise(db, 'Sentadilla');
  for (const id of [bench, row, squat]) await appendExerciseToDay(db, 1, id);

  const dates = [
    '2026-11-01',
    '2026-11-03',
    '2026-11-05',
    '2026-11-07',
    '2026-11-10',
    '2026-11-12',
    '2026-11-14',
  ];

  for (const date of dates) {
    const sessionId = await addSession(db, 1, date);
    await addLog(db, sessionId, bench, 1, 40, 10, `${date}T10:00:00.000Z`);
    await addLog(db, sessionId, bench, 2, 42.5, 8, `${date}T10:05:00.000Z`);
    await addLog(db, sessionId, row, 1, 30, 12, `${date}T10:10:00.000Z`);
    await addLog(db, sessionId, row, 2, 30, 10, `${date}T10:15:00.000Z`);
  }

  // Sesión sin series: no se muestra en el historial
  await addSession(db, 2, '2026-11-16');

  const recent = await getRecentSessions(db, 6);
  assert.equal(recent.length, 6);
  assert.deepEqual(
    recent.map((session) => session.date),
    [
      '2026-11-14',
      '2026-11-12',
      '2026-11-10',
      '2026-11-07',
      '2026-11-05',
      '2026-11-03',
    ]
  );

  const latest = recent[0];
  assert.equal(latest.routineName, 'Lunes');
  assert.equal(latest.setCount, 4);
  assert.equal(latest.volume, 1400);
  assert.deepEqual(
    latest.exercises.map((exercise) => exercise.name),
    ['Press banca', 'Remo con barra']
  );
  assert.deepEqual(latest.exercises[0].sets, [
    { setNumber: 1, weight: 40, reps: 10 },
    { setNumber: 2, weight: 42.5, reps: 8 },
  ]);
  assert.equal(latest.exercises[0].volume, 740);
  assert.equal(latest.exercises[1].volume, 660);

  assert.deepEqual(summarizeSessions(recent), {
    sessions: 6,
    sets: 24,
    volume: 8400,
  });

  // El límite se acota a un mínimo de 1
  assert.equal((await getRecentSessions(db, 0)).length, 1);
});

test('nombres de ejercicios por día en orden', async () => {
  const db = await freshDb();
  const bench = await addExercise(db, 'Press banca');
  const row = await addExercise(db, 'Remo con barra');

  await appendExerciseToDay(db, 1, row);
  await appendExerciseToDay(db, 1, bench);

  const map = await getRoutineExerciseNames(db);
  assert.deepEqual(map.get(1), ['Remo con barra', 'Press banca']);
  assert.equal(map.get(2), undefined);
});

test('formato de fechas y números', () => {
  assert.equal(formatDateShort('2026-11-17'), 'mar 17/11');
  assert.equal(formatRelativeDate('2026-11-19', '2026-11-19'), 'Hoy');
  assert.equal(formatRelativeDate('2026-11-18', '2026-11-19'), 'Ayer');
  assert.equal(formatRelativeDate('2026-11-17', '2026-11-19'), 'mar 17 nov');
  assert.deepEqual(getDateBadgeParts('2026-11-17'), {
    day: '17',
    month: 'nov',
  });
  assert.equal(formatWeight(42.5), '42,5');
  assert.equal(formatWeight(40), '40');
  assert.equal(formatNumber(1240), '1.240');
  assert.equal(formatDateShort('no-es-fecha'), '');
});

/** Crea una base con 2 días, 3 ejercicios y varias sesiones para probar. */
async function seedTrainingData(db) {
  await db.runAsync(
    "INSERT INTO routines (name, day_code, sort_order) VALUES ('Lunes', 'LUN', 1);"
  );
  await db.runAsync(
    "INSERT INTO routines (name, day_code, sort_order) VALUES ('Miércoles', 'MIE', 2);"
  );
  for (const name of ['Press banca', 'Sentadilla', 'Remo']) {
    await db.runAsync(
      'INSERT INTO exercises (name, default_sets, min_reps, max_reps) VALUES (?, 2, 6, 10);',
      [name]
    );
  }
  await db.runAsync(
    'INSERT INTO routine_exercises (routine_id, exercise_id, sort_order) VALUES (1, 1, 1), (1, 2, 2), (2, 3, 1);'
  );
}

test('el día de hoy se resuelve por el código del día de la semana', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  // 2026-11-16 es lunes, 2026-11-17 es martes
  assert.equal((await getTodayRoutine(db, new Date(2026, 10, 16))).name, 'Lunes');
  assert.equal(await getTodayRoutine(db, new Date(2026, 10, 17)), null);
});

test('crear, editar y borrar días respeta un día por día de la semana', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  const created = await createRoutine(db, { name: 'Viernes', dayCode: 'VIE' });
  assert.equal(created.dayCode, 'VIE');

  await assert.rejects(
    () => createRoutine(db, { name: 'Otro lunes', dayCode: 'LUN' }),
    /Ya tenés un día para Lunes/
  );

  const extra1 = await createRoutine(db, { name: 'Extra A', dayCode: 'EXTRA' });
  const extra2 = await createRoutine(db, { name: 'Extra B', dayCode: 'EXTRA' });
  assert.equal(extra1.dayCode, 'EXTRA');
  assert.equal(extra2.dayCode, 'EXTRA2');

  await updateRoutine(db, created.id, { name: 'Viernes pesado', dayCode: 'VIE' });
  const renamed = await db.getFirstAsync('SELECT name FROM routines WHERE id = ?;', [
    created.id,
  ]);
  assert.equal(renamed.name, 'Viernes pesado');

  await deleteRoutine(db, extra2.id);
  assert.equal(
    (await db.getAllAsync("SELECT id FROM routines WHERE day_code = 'EXTRA2';")).length,
    0
  );

  // Con sesiones registradas no se puede borrar
  await saveWorkout(db, {
    routineId: 1,
    date: '2026-11-16',
    entries: [{ exerciseId: 1, sets: [{ weight: '50', reps: '8' }] }],
  });
  await assert.rejects(() => deleteRoutine(db, 1), /sesiones registradas/);
});

test('finalizar el entrenamiento guarda todo y volver a finalizar actualiza', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  const summary = await saveWorkout(db, {
    routineId: 1,
    date: '2026-11-16',
    entries: [
      { exerciseId: 1, sets: [{ weight: '50', reps: '8' }, { weight: '52,5', reps: '6' }] },
      { exerciseId: 2, sets: [{ weight: '80', reps: '10' }] },
    ],
  });
  assert.equal(summary.exerciseCount, 2);
  assert.equal(summary.setCount, 3);
  assert.equal(summary.volume, 1515); // 50×8 + 52,5×6 + 80×10

  const session = await getSessionForDate(db, 1, '2026-11-16');
  assert.equal(session.setCount, 3);

  // Corrige una serie y vuelve a finalizar: no duplica la sesión
  await saveWorkout(db, {
    routineId: 1,
    date: '2026-11-16',
    entries: [
      { exerciseId: 1, sets: [{ weight: '55', reps: '8' }, { weight: '52,5', reps: '6' }] },
      { exerciseId: 2, sets: [{ weight: '80', reps: '10' }] },
    ],
  });
  const sessions = await db.getAllAsync('SELECT id FROM workout_sessions;');
  assert.equal(sessions.length, 1);
  const data = await getWorkoutData(db, 1, '2026-11-16');
  assert.equal(data.savedLogs.get(1)[0].weight, 55);

  // Series sin repeticiones se ignoran y sin ninguna serie no guarda nada
  await assert.rejects(
    () =>
      saveWorkout(db, {
        routineId: 1,
        date: '2026-11-17',
        entries: [{ exerciseId: 1, sets: [{ weight: '50', reps: '' }] }],
      }),
    /al menos una serie/
  );
});

/** Guarda una sesión del ejercicio 1 (Press banca) con todas las series iguales. */
async function logSession(db, date, weight, reps, { sets = 2, exerciseId = 1 } = {}) {
  await saveWorkout(db, {
    routineId: 1,
    date,
    entries: [
      {
        exerciseId,
        sets: Array.from({ length: sets }, () => ({
          weight: String(weight),
          reps: String(reps),
        })),
      },
    ],
  });
}

async function suggestionFor(db, weeks, now, exerciseId = 1) {
  const exercises = (await getDayExercises(db, 1)).filter(
    (exercise) => Number(exercise.id) === exerciseId
  );
  const suggestions = await getProgressionSuggestions(db, exercises, weeks, now);
  return suggestions.get(exerciseId);
}

test('progresión: terminar la primera sesión en el máximo no avisa todavía (1 y 2 semanas)', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  await logSession(db, '2026-11-16', 60, 10);

  // Mismo día en que se guardó la sesión y los días siguientes de esa semana
  for (const weeks of [1, 2]) {
    assert.equal(await suggestionFor(db, weeks, new Date(2026, 10, 16)), undefined);
    assert.equal(await suggestionFor(db, weeks, new Date(2026, 10, 18)), undefined);
    assert.equal(await suggestionFor(db, weeks, new Date(2026, 10, 22)), undefined);
  }
});

test('progresión de 1 semana: avisa recién cuando se cumplió la semana', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  await logSession(db, '2026-11-09', 60, 10);
  await logSession(db, '2026-11-11', 60, 10);

  // Pasaron 6 días desde que empezó con 60 kg: todavía no
  assert.equal(await suggestionFor(db, 1, new Date(2026, 10, 15)), undefined);
  // Pasaron 7 días: ahora sí, un salto fijo de 2,5 kg
  assert.equal(await suggestionFor(db, 1, new Date(2026, 10, 16)), 62.5);

  // Con la configuración de 2 semanas todavía no corresponde
  assert.equal(await suggestionFor(db, 2, new Date(2026, 10, 16)), undefined);
});

test('progresión de 2 semanas: avisa a los 14 días con el máximo en todo el período', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  await logSession(db, '2026-11-09', 60, 10);
  await logSession(db, '2026-11-16', 60, 10);

  assert.equal(await suggestionFor(db, 2, new Date(2026, 10, 16)), undefined);
  assert.equal(await suggestionFor(db, 2, new Date(2026, 10, 22)), undefined);
  assert.equal(await suggestionFor(db, 2, new Date(2026, 10, 23)), 62.5);

  // Si el período ya pasó pero una sesión de la ventana no llegó al máximo, no avisa
  await logSession(db, '2026-11-23', 60, 8);
  assert.equal(await suggestionFor(db, 2, new Date(2026, 10, 23)), undefined);
  assert.equal(await suggestionFor(db, 1, new Date(2026, 10, 23)), undefined);
});

test('progresión: cambiar el peso reinicia el período y el salto es fijo', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);
  // El salto es fijo (no hay columna por ejercicio)
  assert.equal(WEIGHT_STEP, 2.5);

  await logSession(db, '2026-11-02', 60, 10);
  await logSession(db, '2026-11-09', 62.5, 10);

  // Con 62,5 kg solo pasaron 3 días: la semana vuelve a empezar
  assert.equal(await suggestionFor(db, 1, new Date(2026, 10, 12)), undefined);
  assert.equal(await suggestionFor(db, 1, new Date(2026, 10, 16)), 65);

  // Un ejercicio que no llegó al máximo nunca sugiere
  await logSession(db, '2026-11-02', 80, 8, { exerciseId: 2 });
  await logSession(db, '2026-11-09', 80, 8, { exerciseId: 2 });
  assert.equal(await suggestionFor(db, 1, new Date(2026, 10, 16), 2), undefined);

  // Series con pesos distintos dentro de la última sesión no cuentan como tramo
  await saveWorkout(db, {
    routineId: 1,
    date: '2026-11-16',
    entries: [
      { exerciseId: 1, sets: [{ weight: '65', reps: '10' }, { weight: '60', reps: '10' }] },
    ],
  });
  assert.equal(await suggestionFor(db, 1, new Date(2026, 10, 30)), undefined);
});

test('historial completo: paginado, filtro por ejercicio y totales', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  for (let day = 1; day <= 14; day += 1) {
    const date = `2026-11-${String(day).padStart(2, '0')}`;
    const entries = [
      { exerciseId: 1, sets: [{ weight: String(40 + day), reps: '8' }] },
    ];
    if (day % 2 === 0) {
      entries.push({ exerciseId: 2, sets: [{ weight: '80', reps: '5' }] });
    }
    await saveWorkout(db, { routineId: 1, date, entries });
  }

  assert.equal(await countSessions(db), 14);
  assert.equal(await countSessions(db, 2), 7);

  const page1 = await getRecentSessions(db, { limit: 10, offset: 0 });
  const page2 = await getRecentSessions(db, { limit: 10, offset: 10 });
  assert.equal(page1.length, 10);
  assert.equal(page2.length, 4);
  assert.equal(page1[0].date, '2026-11-14');
  assert.equal(page2[3].date, '2026-11-01');

  const squats = await getRecentSessions(db, { exerciseId: 2, limit: 50 });
  assert.equal(squats.length, 7);
  assert.ok(squats.every((session) => session.exercises.length === 1));
  assert.ok(squats.every((session) => session.exercises[0].id === 2));

  const options = await getExerciseFilterOptions(db);
  assert.deepEqual(
    options.map((option) => option.name),
    ['Press banca', 'Sentadilla']
  );

  const allTotals = await getHistoryTotals(db);
  assert.equal(allTotals.sessions, 14);
  assert.equal(allTotals.sets, 21);

  const squatTotals = await getHistoryTotals(db, 2);
  assert.equal(squatTotals.sessions, 7);
  assert.equal(squatTotals.sets, 7);
  assert.equal(squatTotals.volume, 7 * 80 * 5);
  assert.equal(squatTotals.bestWeight, 80);
});

test('borradores del entrenamiento: completar, finalizar y ajustar pesos', () => {
  const exercises = [
    { id: 1, default_sets: 2 },
    { id: 2, default_sets: 3 },
  ];
  const lastLogs = new Map([
    [1, [{ setNumber: 1, weight: 60, reps: 8 }, { setNumber: 2, weight: 57.5, reps: 7 }]],
  ]);

  const drafts = buildInitialDrafts(exercises, lastLogs, new Map());
  assert.deepEqual(drafts[1], [
    { weight: '60', reps: '' },
    { weight: '57.5', reps: '' },
  ]);
  assert.equal(drafts[2].length, 3);
  assert.equal(isWorkoutComplete(exercises, drafts), false);

  drafts[1] = drafts[1].map((set) => ({ ...set, reps: '8' }));
  assert.equal(countCompleted(exercises, drafts), 1);
  assert.equal(isWorkoutComplete(exercises, drafts), false);

  drafts[2] = drafts[2].map((set) => ({ ...set, reps: '10' }));
  assert.equal(isWorkoutComplete(exercises, drafts), true);

  // Quitar una serie sin completar deja el ejercicio completo
  const partial = { ...drafts, 2: [...drafts[2].slice(0, 2), { weight: '', reps: '' }] };
  assert.equal(isWorkoutComplete(exercises, partial), false);
  assert.equal(isWorkoutComplete(exercises, { ...partial, 2: removeLastSet(partial[2]) }), true);
  assert.equal(addSet(drafts[1]).length, 3);
  assert.equal(removeLastSet([{ weight: '1', reps: '1' }]).length, 1);

  const entries = buildWorkoutEntries(exercises, drafts);
  assert.equal(entries[0].exerciseId, 1);
  assert.equal(entries[1].sets.length, 3);

  // Si ya hay una sesión guardada hoy, se muestran esas series
  const saved = new Map([[1, [{ setNumber: 1, weight: 65, reps: 9 }]]]);
  assert.deepEqual(buildInitialDrafts(exercises, lastLogs, saved)[1], [
    { weight: '65', reps: '9' },
  ]);

  assert.equal(adjustWeight('60', 2.5, 'up'), '62.5');
  assert.equal(adjustWeight('60', undefined, 'up'), '62.5'); // salto fijo por defecto
  assert.equal(adjustWeight('', 2.5, 'up'), '2.5');
  assert.equal(adjustWeight('1', 2.5, 'down'), '0');
  assert.equal(adjustWeight('0,1', 0.1, 'up'), '0.2');
  assert.equal(sanitizeWeightInput('42,55abc'), '42.55');
  assert.equal(sanitizeWeightInput('1.2.3'), '1.23');
  assert.equal(sanitizeRepsInput('1a2b'), '12');
  assert.equal(
    describeLastSets(
      [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }],
      (value) => String(value).replace('.', ',')
    ),
    '40 kg × 8 · 7'
  );
});

test('peso inicial: se guarda en el catálogo y se precarga al entrenar', async () => {
  const db = await freshDb();
  const press = await addExercise(db, 'Press banca', { initialWeight: '42,5' });
  const remo = await addExercise(db, 'Remo');
  await appendExerciseToDay(db, 1, press);
  await appendExerciseToDay(db, 1, remo);

  const stored = await db.getFirstAsync('SELECT * FROM exercises WHERE id = ?', [press]);
  assert.equal(Number(stored.initial_weight), 42.5);
  assert.equal(
    Number((await db.getFirstAsync('SELECT * FROM exercises WHERE id = ?', [remo])).initial_weight),
    0
  );

  // Sin historial: el peso inicial es el peso por defecto de todas las series
  const exercises = await getDayExercises(db, 1);
  let drafts = buildInitialDrafts(exercises, new Map(), new Map());
  assert.deepEqual(drafts[press], [
    { weight: '42.5', reps: '' },
    { weight: '42.5', reps: '' },
  ]);
  // Sin peso inicial queda vacío, como antes
  assert.deepEqual(drafts[remo], [
    { weight: '', reps: '' },
    { weight: '', reps: '' },
  ]);

  // Es editable libremente en la rutina del día
  drafts = {
    ...drafts,
    [press]: drafts[press].map((set) => ({ ...set, weight: adjustWeight(set.weight, WEIGHT_STEP, 'up') })),
  };
  assert.equal(drafts[press][0].weight, '45');

  // Con historial manda el último peso usado
  const lastLogs = new Map([[press, [{ setNumber: 1, weight: 50, reps: 8 }]]]);
  assert.equal(buildInitialDrafts(exercises, lastLogs, new Map())[press][0].weight, '50');

  // Se puede editar el peso inicial y también quitarlo
  await updateExercise(db, press, {
    name: 'Press banca',
    defaultSets: 2,
    minReps: 6,
    maxReps: 10,
    initialWeight: '',
  });
  assert.equal(
    Number((await db.getFirstAsync('SELECT * FROM exercises WHERE id = ?', [press])).initial_weight),
    0
  );

  assert.equal(formatInitialWeight(42.5), ' · inicial 42,5 kg');
  assert.equal(formatInitialWeight(0), '');
  assert.equal(formatInitialWeight(undefined), '');
});

test('pantalla principal: solo el primer ejercicio arranca abierto', () => {
  const exercises = [{ id: 7 }, { id: 3 }, { id: 9 }];
  assert.deepEqual([...buildInitialCollapsed(exercises)], [3, 9]);
  assert.equal(buildInitialCollapsed([{ id: 1 }]).size, 0);
  assert.equal(buildInitialCollapsed([]).size, 0);
});

test('RIR: se guarda por ejercicio, es opcional y se restaura al volver', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  const exercises = [{ id: 1 }, { id: 2 }];
  const drafts = {
    1: [{ weight: '60', reps: '8' }, { weight: '60', reps: '7' }],
    2: [{ weight: '80', reps: '10' }],
  };

  // Sin RIR en ningún ejercicio: se guarda igual (no es obligatorio)
  let entries = buildWorkoutEntries(exercises, drafts, {});
  assert.equal(entries[0].rir, null);
  await saveWorkout(db, { routineId: 1, date: '2026-11-16', entries });
  let rows = await db.getAllAsync('SELECT rir FROM set_logs;');
  assert.ok(rows.every((row) => row.rir === null));

  // RIR 2 en el ejercicio 1 y sin RIR en el 2: se repite en todas las series del 1
  entries = buildWorkoutEntries(exercises, drafts, { 1: 2, 2: null });
  await saveWorkout(db, { routineId: 1, date: '2026-11-16', entries });
  rows = await db.getAllAsync('SELECT exercise_id, rir FROM set_logs ORDER BY id;');
  assert.deepEqual(
    rows.map((row) => [Number(row.exercise_id), row.rir === null ? null : Number(row.rir)]).sort(),
    [[1, 2], [1, 2], [2, null]]
  );

  // Al volver a la pantalla se restaura la selección guardada hoy
  const data = await getWorkoutData(db, 1, '2026-11-16');
  assert.deepEqual(buildInitialRir(exercises, data.savedLogs), { 1: 2, 2: null });
  assert.deepEqual(buildInitialRir(exercises, new Map()), { 1: null, 2: null });

  // Corregir y volver a finalizar actualiza el RIR (también se puede quitar)
  entries = buildWorkoutEntries(exercises, drafts, { 1: 3, 2: 1 });
  await saveWorkout(db, { routineId: 1, date: '2026-11-16', entries });
  const updated = await getWorkoutData(db, 1, '2026-11-16');
  assert.deepEqual(buildInitialRir(exercises, updated.savedLogs), { 1: 3, 2: 1 });
  await saveWorkout(db, {
    routineId: 1,
    date: '2026-11-16',
    entries: buildWorkoutEntries(exercises, drafts, { 1: null, 2: 1 }),
  });
  const cleared = await getWorkoutData(db, 1, '2026-11-16');
  assert.deepEqual(buildInitialRir(exercises, cleared.savedLogs), { 1: null, 2: 1 });

  // Solo se admiten 1, 2 o 3
  for (const invalid of [0, 4, 1.5, 'x']) {
    await assert.rejects(
      () =>
        saveWorkout(db, {
          routineId: 1,
          date: '2026-11-17',
          entries: buildWorkoutEntries(exercises, drafts, { 1: invalid }),
        }),
      /RIR/
    );
  }
  assert.throws(
    () => db.raw.prepare('UPDATE set_logs SET rir = 5;').run(),
    /CHECK/
  );
});

test('esquema limpio: sin columna de salto de peso y con peso inicial y RIR', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await db.execAsync(SCHEMA_SQL); // idempotente

  const columns = async (table) =>
    (await db.getAllAsync(`PRAGMA table_info(${table});`)).map((c) => c.name);

  assert.deepEqual(await columns('exercises'), [
    'id', 'name', 'default_sets', 'min_reps', 'max_reps', 'initial_weight', 'is_active',
  ]);
  assert.ok((await columns('set_logs')).includes('rir'));
  assert.ok((await columns('routines')).includes('warmup'));
});

test('última sesión previa: excluye la de hoy e incluye fecha y RIR', async () => {
  const db = createAdapter();
  await db.execAsync(SCHEMA_SQL);
  await seedTrainingData(db);

  // Sin historial: no rompe y no hay referencia
  let data = await getWorkoutData(db, 1, '2026-11-09');
  assert.equal(data.lastLogs.get(1), undefined);
  assert.equal(describeLastSets(data.lastLogs.get(1)), '');

  await saveWorkout(db, {
    routineId: 1,
    date: '2026-11-02',
    entries: [{ exerciseId: 1, rir: 2, sets: [{ weight: '60', reps: '8' }, { weight: '60', reps: '7' }] }],
  });
  await saveWorkout(db, {
    routineId: 1,
    date: '2026-11-09',
    entries: [{ exerciseId: 1, sets: [{ weight: '62.5', reps: '6' }] }],
  });

  // El día 09 la referencia es la sesión del 02 (no la de ese mismo día)
  data = await getWorkoutData(db, 1, '2026-11-09');
  const last = data.lastLogs.get(1);
  assert.equal(last[0].date, '2026-11-02');
  assert.equal(describeLastSets(last), '60 kg × 8 · 7 · RIR 2');

  // Un día posterior toma la del 09 (sin RIR)
  data = await getWorkoutData(db, 1, '2026-11-16');
  assert.equal(data.lastLogs.get(1)[0].date, '2026-11-09');
  assert.equal(describeLastSets(data.lastLogs.get(1)), '62.5 kg × 6');
  assert.equal(data.lastLogs.get(2), undefined);
});

test('respaldo: exporta, restaura y deja la base intacta si la copia falla', async () => {
  const src = createAdapter();
  await src.execAsync(SCHEMA_SQL);
  await seedTrainingData(src);
  await saveWorkout(src, {
    routineId: 1,
    date: '2026-11-02',
    entries: [{ exerciseId: 1, rir: 3, sets: [{ weight: '60', reps: '8' }] }],
  });
  await src.runAsync("INSERT OR REPLACE INTO app_settings (id, theme, progression_weeks) VALUES (1, 'light', 1);");

  const text = serializeBackup(await createBackup(src, new Date('2026-11-24T12:00:00Z')));
  const backup = parseBackup(`  ${text}\n`);
  assert.deepEqual(
    { ...summarizeBackup(backup), createdAt: undefined },
    { createdAt: undefined, routines: backup.tables.routines.rows.length, exercises: backup.tables.exercises.rows.length, sessions: 1, sets: 1 }
  );

  // Restaurar sobre otra base con datos distintos la reemplaza por completo
  const dst = createAdapter();
  await dst.execAsync(SCHEMA_SQL);
  await dst.runAsync("INSERT INTO exercises (name) VALUES ('Otro ejercicio');");
  await restoreBackup(dst, backup);

  for (const table of ['routines', 'exercises', 'routine_exercises', 'workout_sessions', 'set_logs', 'app_settings']) {
    assert.deepEqual(
      await dst.getAllAsync(`SELECT * FROM ${table} ORDER BY id;`),
      await src.getAllAsync(`SELECT * FROM ${table} ORDER BY id;`),
      table
    );
  }
  assert.equal((await dst.getFirstAsync('SELECT theme FROM app_settings WHERE id = 1;')).theme, 'light');
  assert.equal(Number((await dst.getFirstAsync('SELECT rir FROM set_logs;')).rir), 3);

  // Entradas inválidas
  for (const bad of ['', 'hola', '{}', '{"format":"otro"}', JSON.stringify({ ...backup, version: 99 }),
    JSON.stringify({ ...backup, tables: { ...backup.tables, set_logs: { columns: ['id'], rows: [] } } })]) {
    assert.throws(() => parseBackup(bad), /copia|versión/i);
  }

  // Una copia con referencias rotas falla y no toca los datos actuales
  const broken = JSON.parse(text);
  const sl = broken.tables.set_logs;
  sl.rows[0][sl.columns.indexOf('exercise_id')] = 999;
  const before = await dst.getAllAsync('SELECT * FROM set_logs;');
  await assert.rejects(() => restoreBackup(dst, parseBackup(JSON.stringify(broken))));
  assert.deepEqual(await dst.getAllAsync('SELECT * FROM set_logs;'), before);
  assert.equal((await dst.getAllAsync('SELECT * FROM exercises;')).length, backup.tables.exercises.rows.length);

  // Una copia de una versión anterior (sin rir ni peso inicial) también restaura
  const old = JSON.parse(text);
  old.tables.set_logs = { columns: old.tables.set_logs.columns.filter((c) => c !== 'rir'), rows: old.tables.set_logs.rows.map((r) => r.filter((_, i) => old.tables.set_logs.columns[i] !== 'rir')) };
  old.tables.exercises = { columns: old.tables.exercises.columns.filter((c) => c !== 'initial_weight'), rows: old.tables.exercises.rows.map((r) => r.filter((_, i) => old.tables.exercises.columns[i] !== 'initial_weight')) };
  await restoreBackup(dst, parseBackup(JSON.stringify(old)));
  assert.equal((await dst.getFirstAsync('SELECT rir FROM set_logs;')).rir, null);
  assert.equal(Number((await dst.getFirstAsync('SELECT initial_weight FROM exercises WHERE id = 1;')).initial_weight), 0);
});

async function main() {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log(`\n${tests.length} tests OK`);
}

main().catch((error) => {
  console.error('\n✗ Test falló');
  console.error(error);
  process.exitCode = 1;
});
