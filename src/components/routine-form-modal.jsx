import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { WEEKDAY_OPTIONS } from '../constants/weekdays';
import { colors, radius, spacing } from '../constants/app-theme';

/**
 * Alta y edición de un día de entrenamiento.
 * `onSubmit` recibe { name, dayCode } y puede lanzar un Error para mostrarlo.
 */
export default function RoutineFormModal({
  visible,
  routine = null,
  onSubmit,
  onClose,
}) {
  const isEditing = Boolean(routine);

  const [name, setName] = useState('');
  const [dayCode, setDayCode] = useState('LUN');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(routine?.name ?? '');
    setDayCode(
      routine?.day_code?.startsWith('EXTRA') ? 'EXTRA' : routine?.day_code ?? 'LUN'
    );
    setError(null);
    setSaving(false);
  }, [visible, routine]);

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSubmit({ name, dayCode });
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el día.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Cerrar"
        />

        <View style={styles.card}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                {isEditing ? 'Editar día' : 'Nuevo día'}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ej: Piernas"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="sentences"
            />

            <Text style={styles.label}>¿Qué día de la semana es?</Text>
            <View style={styles.daysGrid}>
              {WEEKDAY_OPTIONS.map((option) => {
                const active = dayCode === option.code;
                return (
                  <TouchableOpacity
                    key={option.code}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                    onPress={() => setDayCode(option.code)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        active && styles.dayChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.dayChip,
                  styles.extraChip,
                  dayCode === 'EXTRA' && styles.dayChipActive,
                ]}
                onPress={() => setDayCode('EXTRA')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Día extra"
              >
                <Text
                  style={[
                    styles.dayChipText,
                    dayCode === 'EXTRA' && styles.dayChipTextActive,
                  ]}
                >
                  Extra
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>
              La pantalla de inicio muestra automáticamente el día que
              corresponde a hoy. Los días extra se pueden empezar a mano desde
              inicio.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSubmit}
                disabled={saving}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.saveText}>
                  {saving
                    ? 'Guardando...'
                    : isEditing
                      ? 'Guardar cambios'
                      : 'Crear día'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.overlay,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  closeButton: {
    padding: 6,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  dayChip: {
    width: '31%',
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extraChip: {
    width: '31%',
  },
  dayChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  dayChipText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  dayChipTextActive: {
    color: colors.primaryText,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: 10,
    marginTop: spacing.xs,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12.5,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.primaryStrong,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  saveText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
});
