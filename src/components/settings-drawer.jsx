import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing } from '../constants/app-theme';
import { useAppTheme, useStyles } from './theme-provider';

function NavRow({ glyph, title, subtitle, onPress }) {
  const { styles } = useStyles(createStyles);
  return (
    <TouchableOpacity
      style={styles.navRow}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.navIcon}>
        <Text style={styles.navIconText}>{glyph}</Text>
      </View>

      <View style={styles.navText}>
        <Text style={styles.navTitle}>{title}</Text>
        {subtitle ? <Text style={styles.navSubtitle}>{subtitle}</Text> : null}
      </View>

      <Text style={styles.navChevron}>›</Text>
    </TouchableOpacity>
  );
}

/**
 * Panel lateral de ajustes: accesos a rutinas, historial y catálogo, la
 * preferencia de progresión, el tema (claro/oscuro) y el respaldo de datos.
 */
export default function SettingsDrawer({
  visible,
  onClose,
  progressionWeeks,
  saving,
  onChangeWeeks,
  catalogCount,
  routinesCount = 0,
  onNavigate,
  onExportBackup,
  onRestoreBackup,
}) {
  const { styles } = useStyles(createStyles);
  const { mode, setMode } = useAppTheme();

  const navigateTo = (path) => {
    onClose();
    onNavigate(path);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Cerrar ajustes"
        />

        <SafeAreaView
          style={styles.sheet}
          edges={['top', 'bottom', 'right']}
        >
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>MI GYM</Text>
                <Text style={styles.title}>Ajustes</Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cerrar ajustes"
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Entrenamiento</Text>

            <View style={styles.navGroup}>
              <NavRow
                glyph="▤"
                title="Rutinas"
                subtitle={`Creá y editá tus días · ${routinesCount} ${
                  routinesCount === 1 ? 'día cargado' : 'días cargados'
                }`}
                onPress={() => navigateTo('/routines')}
              />
              <View style={styles.divider} />
              <NavRow
                glyph="↺"
                title="Historial de sesiones"
                subtitle="Revisá tus sesiones · filtrá por ejercicio"
                onPress={() => navigateTo('/history')}
              />
              <View style={styles.divider} />
              <NavRow
                glyph="▲"
                title="Progreso y comparativas"
                subtitle="Tu carga real: semana vs. semana o mes anterior"
                onPress={() => navigateTo('/progress')}
              />
              <View style={styles.divider} />
              <NavRow
                glyph="▦"
                title="Catálogo de ejercicios"
                subtitle={`${catalogCount} ${
                  catalogCount === 1 ? 'ejercicio cargado' : 'ejercicios cargados'
                }`}
                onPress={() => navigateTo('/exercises')}
              />
            </View>

            <Text style={styles.sectionLabel}>Progresión</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Ventana para subir peso</Text>
              <Text style={styles.cardHint}>
                Cuántas semanas tienen que pasar con el mismo peso, llegando al
                máximo de repeticiones, para que la app te sugiera subir de peso.
              </Text>

              <View style={styles.options}>
                {[1, 2].map((weeks) => {
                  const active = progressionWeeks === weeks;
                  return (
                    <TouchableOpacity
                      key={weeks}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => onChangeWeeks(weeks)}
                      disabled={saving}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Progresión de ${weeks} ${
                        weeks === 1 ? 'semana' : 'semanas'
                      }`}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          active && styles.optionTextActive,
                        ]}
                      >
                        {weeks} {weeks === 1 ? 'semana' : 'semanas'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Text style={styles.sectionLabel}>Apariencia</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tema</Text>
              <Text style={styles.cardHint}>
                Elegí entre modo claro u oscuro.
              </Text>

              <View style={styles.options}>
                {[
                  { value: 'light', label: '☀ Modo claro' },
                  { value: 'dark', label: '☾ Modo oscuro' },
                ].map((option) => {
                  const active = mode === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => setMode(option.value)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={option.label}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          active && styles.optionTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Text style={styles.sectionLabel}>Respaldo</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Copia de seguridad</Text>
              <Text style={styles.cardHint}>
                Exportá todos tus datos (rutinas, ejercicios, historial y
                ajustes) para guardarlos donde quieras, o restaurá una copia
                anterior. No necesita internet ni cuenta.
              </Text>

              <View style={styles.options}>
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onClose();
                    onExportBackup?.();
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Exportar copia de seguridad"
                >
                  <Text style={styles.optionText}>⇪ Exportar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onClose();
                    onRestoreBackup?.();
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Restaurar copia de seguridad"
                >
                  <Text style={styles.optionText}>⇩ Restaurar</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Datos</Text>

            <View style={styles.card}>
              <Text style={styles.cardHint}>
                Todo se guarda en tu teléfono. No hace
                falta internet ni cuenta.
              </Text>
            </View>

            <Text style={styles.footer}>My Gym · v1.1.0</Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    width: '82%',
    maxWidth: 340,
    backgroundColor: colors.bgSoft,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  sheetContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  navGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  navIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  navIconText: {
    color: colors.primaryText,
    fontSize: 17,
    fontWeight: '800',
  },
  navText: {
    flex: 1,
    gap: 2,
  },
  navTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  navSubtitle: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
  },
  navChevron: {
    color: colors.textFaint,
    fontSize: 22,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 64,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  options: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  option: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  optionTextActive: {
    color: colors.primaryText,
  },
  footer: {
    color: colors.textFaint,
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.md,
    letterSpacing: 0.6,
  },
});
