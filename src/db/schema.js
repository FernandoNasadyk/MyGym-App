/**
 * Definición del esquema local de My Gym.
 *
 * Vive en su propio módulo (sin imports de React Native ni de expo-sqlite)
 * para poder crear la misma base en los tests que corren con node:sqlite.
 */
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    day_code TEXT NOT NULL UNIQUE,
    is_extra INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    warmup TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    default_sets INTEGER NOT NULL DEFAULT 2,
    min_reps INTEGER NOT NULL DEFAULT 6,
    max_reps INTEGER NOT NULL DEFAULT 10,
    weight_step REAL NOT NULL DEFAULT 2.5,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS routine_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(routine_id, exercise_id),
    FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL,
    session_date TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS set_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    set_number INTEGER NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    completed_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL DEFAULT 'dark',
    progression_weeks INTEGER NOT NULL DEFAULT 2 CHECK (progression_weeks IN (1, 2))
  );

  CREATE INDEX IF NOT EXISTS idx_routine_exercises_order
    ON routine_exercises (routine_id, sort_order);

  CREATE INDEX IF NOT EXISTS idx_workout_sessions_routine_date
    ON workout_sessions (routine_id, session_date);

  CREATE INDEX IF NOT EXISTS idx_set_logs_exercise_session
    ON set_logs (exercise_id, session_id);
`;
