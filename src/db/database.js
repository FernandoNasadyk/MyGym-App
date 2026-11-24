import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';
import { normalizeAllDayOrders } from './day-exercises';

let dbInstance = null;
let dbPromise = null;

async function seedDefaults(db) {
  const defaultRoutines = [
    {
      name: 'Lunes',
      day_code: 'LUN',
      is_extra: 0,
      sort_order: 1,
      warmup:
        'Movilidad rápida de hombros → 8 a 10 flexiones suaves → Serie liviana de press banca (10-12 repeticiones) → Serie intermedia de press banca (1-6 repeticiones)',
    },
    {
      name: 'Miércoles',
      day_code: 'MIE',
      is_extra: 0,
      sort_order: 2,
      warmup:
        'Movilidad articular general → Calentamiento específico del bloque principal',
    },
    {
      name: 'Viernes',
      day_code: 'VIE',
      is_extra: 0,
      sort_order: 3,
      warmup:
        'Movilidad dinámica → Aproximaciones progresivas antes de las series efectivas',
    },
    {
      name: 'Día Extra',
      day_code: 'EXTRA',
      is_extra: 1,
      sort_order: 4,
      warmup: 'Movilidad rápida + 1 o 2 series de aproximación livianas',
    },
  ];

  for (const r of defaultRoutines) {
    const existing = await db.getFirstAsync(
      'SELECT id, warmup FROM routines WHERE day_code = ? OR name = ?;',
      [r.day_code, r.name]
    );
    if (!existing) {
      await db.runAsync(
        `INSERT INTO routines (name, day_code, is_extra, sort_order, warmup)
         VALUES (?, ?, ?, ?, ?);`,
        [r.name, r.day_code, r.is_extra, r.sort_order, r.warmup]
      );
    } else if (!existing.warmup && r.warmup) {
      await db.runAsync(
        'UPDATE routines SET warmup = ? WHERE id = ?;',
        [r.warmup, existing.id]
      );
    }
  }

  const settings = await db.getFirstAsync(
    'SELECT id FROM app_settings WHERE id = 1;'
  );
  if (!settings) {
    await db.runAsync(
      `INSERT INTO app_settings (id, theme, progression_weeks)
       VALUES (1, 'dark', 2);`
    );
  }
}

export async function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  // Una sola inicialización aunque varias pantallas pidan la base a la vez.
  if (!dbPromise) {
    dbPromise = initializeDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

async function initializeDatabase() {
  const db = await SQLite.openDatabaseAsync('my_gym.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  await db.execAsync(SCHEMA_SQL);

  await seedDefaults(db);

  // Deja el orden de cada día en 1..n. Es idempotente y arregla los
  // sort_order viejos que se guardaban con el id del ejercicio.
  await normalizeAllDayOrders(db);

  dbInstance = db;
  return dbInstance;
}
