# My Gym

App personal para seguir una rutina de gimnasio. Corre con **Expo + React Native** y guarda todo en **SQLite local** (sin internet ni cuenta).

## Qué hace

- **Pantalla de inicio = entrenar**: muestra solo la rutina del día de hoy (si hoy es miércoles, aparece el día Miércoles). Cargás kg y repeticiones de cada serie y, cuando completás todos los ejercicios, aparece **Finalizar entrenamiento de hoy**, que guarda toda la sesión de una vez.
- **Día de descanso**: si hoy no tenés rutina, la pantalla lo dice y te deja elegir otro día para entrenar igual.
- **Rutinas** (Ajustes → Rutinas): crear, renombrar, mover y eliminar días (un día por día de la semana, más días Extra), con su calentamiento editable y sus ejercicios en orden.
- **Catálogo de ejercicios** con series por defecto, rango de repeticiones y peso inicial (se precarga al entrenar); baja lógica que no borra el historial.
- **Historial completo** con filtro por ejercicio, totales (sesiones, series, volumen, mejor peso) y carga de a 10 sesiones.
- **Sugerencia de progresión**: si cumplís el máximo de reps con el mismo peso y pasó el período de 1 o 2 semanas (configurable en Ajustes), te propone subir el peso en saltos fijos de 2,5 kg.
- La próxima sesión precarga los últimos pesos y muestra qué hiciste la última vez.

## Navegación

- **Inicio**: rutina de hoy y acceso a Ajustes (☰). No se edita nada acá.
- **Ajustes** (panel lateral): Rutinas, historial, catálogo y ventana de progresión.
- **Rutinas** → **Editar día**: calentamiento, ejercicios, orden y datos del día.
- **Historial**: sesiones expandibles con el detalle de cada serie y filtro por ejercicio.

## Cómo correrla

```bash
npm install
npm start          # luego escaneá el QR con Expo Go
npm run android    # emulador/dispositivo Android
npm run ios        # simulador iOS (macOS)
npm run web        # navegador
```

La base se crea sola la primera vez (`my_gym.db`) y se migra automáticamente en cada arranque.

## Estructura

```
src/app/                 rutas de Expo Router (una pantalla por archivo)
  _layout.jsx            Stack raíz + barra de estado
  index.jsx              inicio: entrenamiento del día y botón Finalizar
  routines.jsx           lista de días (crear, mover, editar, eliminar)
  routine.jsx            editor de un día: calentamiento y ejercicios
  exercises.jsx          catálogo de ejercicios
  history.jsx            historial completo con filtro por ejercicio
src/components/          drawer, header, barra de progreso, modales
src/constants/
  app-theme.js           colores, espacios y sombras
  weekdays.js            códigos y etiquetas de los días de la semana
  theme.ts               theme del template de Expo (sin uso en la app)
src/db/
  schema.js              esquema SQL (compartido con los tests)
  database.js            apertura, migraciones y datos iniciales
  routines.js            alta, edición, baja y orden de los días
  day-exercises.js       catálogo y orden de ejercicios por día
  workout.js             datos del entrenamiento, guardado y progresión
  history.js             historial paginado, filtro y totales
src/utils/
  format.js              fechas, pesos y volúmenes en formato local
  warmup.js              pasos del calentamiento
  workout-draft.js       lógica pura de los borradores de series
scripts/test-db.mjs      tests con node:sqlite
```

## Base de datos

| Tabla | Para qué |
| --- | --- |
| `routines` | días y su calentamiento |
| `exercises` | catálogo (nombre, series, reps, peso inicial) |
| `routine_exercises` | qué ejercicio va en qué día y en qué orden |
| `workout_sessions` | una sesión por día y fecha |
| `set_logs` | cada serie registrada (kg y reps) |
| `app_settings` | preferencias (semanas de progresión) |

## Chequeos

```bash
npm run test:db     # 26 tests de días, entrenamiento, progresión, RIR, migraciones, historial y formato
npx tsc --noEmit    # typecheck (también revisa la sintaxis de los .jsx)
```

`npx expo lint` todavía no está configurado (falta instalar ESLint + `eslint-config-expo`).

## Próximos pasos posibles

- Exportar/importar la base para backup.
- Reordenar con arrastrar y soltar (hoy se usan flechas ↑ ↓).
- Guardar el borrador del entrenamiento en curso por si se cierra la app antes de finalizar.
