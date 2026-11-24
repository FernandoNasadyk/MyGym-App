import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getDatabase } from '../db/database';
import { themes } from '../constants/app-theme';

const ThemeContext = createContext({
  mode: 'dark',
  isDark: true,
  colors: themes.dark,
  setMode: async () => {},
  reloadTheme: async () => {},
});

/**
 * Provee la paleta (modo claro u oscuro, ambos en verde) a toda la app.
 * La preferencia se guarda en app_settings.theme ('dark' | 'light').
 */
export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('dark');
  const [ready, setReady] = useState(false);

  const reloadTheme = useCallback(async () => {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync(
        'SELECT theme FROM app_settings WHERE id = 1;'
      );
      setModeState(row?.theme === 'light' ? 'light' : 'dark');
    } catch (err) {
      console.error('Error cargando el tema:', err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reloadTheme();
  }, [reloadTheme]);

  const setMode = useCallback(async (next) => {
    const value = next === 'light' ? 'light' : 'dark';
    setModeState(value);
    try {
      const db = await getDatabase();
      await db.runAsync('UPDATE app_settings SET theme = ? WHERE id = 1;', [
        value,
      ]);
    } catch (err) {
      console.error('Error guardando el tema:', err);
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      isDark: mode === 'dark',
      colors: themes[mode],
      setMode,
      reloadTheme,
    }),
    [mode, setMode, reloadTheme]
  );

  // Esperamos a leer la preferencia para no mostrar un destello del otro tema.
  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}

/**
 * Devuelve los estilos de un componente armados con la paleta activa.
 * `createStyles` es una función (colors) => StyleSheet.create({...}) definida
 * a nivel de módulo.
 */
export function useStyles(createStyles) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [createStyles, colors]);
  return { styles, colors };
}
