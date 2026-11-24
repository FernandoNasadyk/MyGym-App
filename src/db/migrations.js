/**
 * Migraciones de columnas para bases de datos ya creadas.
 *
 * Vive en su propio módulo (sin imports de React Native ni de expo-sqlite)
 * para poder probarla con node:sqlite. Es idempotente: se puede correr en
 * cada arranque y solo agrega lo que falta, sin tocar los datos existentes.
 */

async function hasColumn(db, table, column) {
  const columns = await db.getAllAsync(`PRAGMA table_info(${table});`);
  return columns.some((col) => col.name === column);
}

export async function addMissingColumns(db) {
  // Peso inicial del ejercicio (reemplaza a la edición del salto de peso).
  // 0 = sin peso inicial definido. La columna weight_step se conserva por
  // compatibilidad, pero la app ya no la usa (el salto es fijo: 2,5 kg).
  if (!(await hasColumn(db, 'exercises', 'initial_weight'))) {
    await db.runAsync(
      `ALTER TABLE exercises ADD COLUMN initial_weight REAL NOT NULL DEFAULT 0;`
    );
  }

  // RIR del ejercicio en esa sesión (1, 2 o 3). NULL = no se usó RIR.
  if (!(await hasColumn(db, 'set_logs', 'rir'))) {
    await db.runAsync(
      `ALTER TABLE set_logs ADD COLUMN rir INTEGER CHECK (rir IS NULL OR rir BETWEEN 1 AND 3);`
    );
  }
}
