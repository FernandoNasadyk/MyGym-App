/**
 * Respaldo y restauración de los datos locales de My Gym.
 *
 * La copia es un JSON con todas las tablas (rutinas, ejercicios, sesiones,
 * series y ajustes). No depende de expo-sqlite ni de React Native, así que se
 * puede probar con node:sqlite (ver scripts/test-db.mjs).
 *
 * Formato compacto: cada tabla guarda sus columnas una sola vez y las filas
 * como arreglos, para que el texto pese lo menos posible.
 */

export const BACKUP_FORMAT = 'my-gym-backup';
export const BACKUP_VERSION = 1;

// Orden de dependencias: primero los padres, después los hijos.
const TABLES = [
  'routines',
  'exercises',
  'routine_exercises',
  'workout_sessions',
  'set_logs',
  'app_settings',
];

// Columnas que no pueden faltar en una copia (el resto toma su valor por
// defecto, así se pueden restaurar copias hechas con versiones anteriores).
const REQUIRED_COLUMNS = {
  routines: ['id', 'name', 'day_code'],
  exercises: ['id', 'name'],
  routine_exercises: ['id', 'routine_id', 'exercise_id'],
  workout_sessions: ['id', 'routine_id', 'session_date'],
  set_logs: [
    'id',
    'session_id',
    'exercise_id',
    'set_number',
    'weight',
    'reps',
    'completed_at',
  ],
  app_settings: ['id'],
};

const INVALID_MESSAGE =
  'El texto no es una copia de seguridad válida de My Gym.';

/** Arma el objeto de respaldo con el contenido actual de la base. */
export async function createBackup(db, now = new Date()) {
  const tables = {};

  for (const table of TABLES) {
    const info = await db.getAllAsync(`PRAGMA table_info(${table});`);
    const columns = info.map((col) => col.name);
    const rows = await db.getAllAsync(`SELECT * FROM ${table} ORDER BY id ASC;`);
    tables[table] = {
      columns,
      rows: rows.map((row) => columns.map((column) => row[column] ?? null)),
    };
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    tables,
  };
}

export function serializeBackup(backup) {
  return JSON.stringify(backup);
}

/** Cantidades por tabla, para mostrar qué contiene una copia. */
export function summarizeBackup(backup) {
  const count = (table) => backup.tables[table].rows.length;
  return {
    createdAt: backup.createdAt,
    routines: count('routines'),
    exercises: count('exercises'),
    sessions: count('workout_sessions'),
    sets: count('set_logs'),
  };
}

/**
 * Convierte el texto pegado en un respaldo validado.
 * Lanza un Error con un mensaje listo para mostrar al usuario.
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? '').trim());
  } catch {
    throw new Error(INVALID_MESSAGE);
  }
  return validateBackup(data);
}

export function validateBackup(data) {
  if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT) {
    throw new Error(INVALID_MESSAGE);
  }
  if (!Number.isInteger(data.version) || data.version > BACKUP_VERSION) {
    throw new Error(
      'Esta copia es de una versión más nueva de My Gym. Actualizá la app para restaurarla.'
    );
  }
  if (!data.tables || typeof data.tables !== 'object') {
    throw new Error(INVALID_MESSAGE);
  }

  for (const table of TABLES) {
    const entry = data.tables[table];
    if (
      !entry ||
      !Array.isArray(entry.columns) ||
      !Array.isArray(entry.rows) ||
      !entry.columns.every((column) => typeof column === 'string')
    ) {
      throw new Error(`${INVALID_MESSAGE} (falta la tabla ${table}).`);
    }

    for (const required of REQUIRED_COLUMNS[table]) {
      if (!entry.columns.includes(required)) {
        throw new Error(
          `${INVALID_MESSAGE} (falta la columna ${required} en ${table}).`
        );
      }
    }

    const idIndex = entry.columns.indexOf('id');
    for (const row of entry.rows) {
      if (!Array.isArray(row) || row.length !== entry.columns.length) {
        throw new Error(`${INVALID_MESSAGE} (fila inválida en ${table}).`);
      }
      if (!Number.isInteger(row[idIndex])) {
        throw new Error(`${INVALID_MESSAGE} (id inválido en ${table}).`);
      }
      for (const value of row) {
        const type = typeof value;
        if (value !== null && type !== 'string' && type !== 'number') {
          throw new Error(`${INVALID_MESSAGE} (valor inválido en ${table}).`);
        }
      }
    }
  }

  return data;
}

/**
 * Reemplaza TODOS los datos actuales por los de la copia, dentro de una
 * transacción: si algo falla, la base queda exactamente como estaba.
 */
export async function restoreBackup(db, backup) {
  const data = validateBackup(backup);

  // Columnas reales de cada tabla (una copia vieja puede no traer las nuevas).
  const dbColumns = {};
  for (const table of TABLES) {
    const info = await db.getAllAsync(`PRAGMA table_info(${table});`);
    dbColumns[table] = info.map((col) => col.name);
  }

  await db.withTransactionAsync(async () => {
    for (const table of [...TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${table};`);
    }

    for (const table of TABLES) {
      const { columns, rows } = data.tables[table];
      const usable = columns
        .map((name, index) => ({ name, index }))
        .filter(({ name }) => dbColumns[table].includes(name));
      if (usable.length === 0 || rows.length === 0) continue;

      const sql = `INSERT INTO ${table} (${usable
        .map(({ name }) => name)
        .join(', ')}) VALUES (${usable.map(() => '?').join(', ')});`;

      for (const row of rows) {
        await db.runAsync(
          sql,
          usable.map(({ index }) => row[index])
        );
      }
    }

    // Por si la copia no traía los ajustes
    await db.runAsync(
      `INSERT OR IGNORE INTO app_settings (id, theme, progression_weeks)
       VALUES (1, 'dark', 2);`
    );
  });

  return summarizeBackup(data);
}
