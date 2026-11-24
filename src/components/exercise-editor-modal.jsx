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
import { normalizeExerciseInput } from '../db/day-exercises';

/**
 * Modal para editar los datos base de un ejercicio (series, repeticiones,
 * peso inicial y nombre). No toca el historial de series ya registradas.
 *
 * `onSave` recibe los datos ya normalizados y puede lanzar un Error
 * (por ejemplo, si el nombre ya existe); el mensaje se muestra en el modal.
 */
export default function ExerciseEditorModal({
  exercise,
  visible,
  onClose,
  onSave,
}) {
  const [name, setName] = useState('');
  const [defaultSets, setDefaultSets] = useState('2');
  const [minReps, setMinReps] = useState('6');
  const [maxReps, setMaxReps] = useState('10');
  const [initialWeight, setInitialWeight] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    setName(exercise.name ?? '');
    setDefaultSets(String(exercise.default_sets ?? 2));
    setMinReps(String(exercise.min_reps ?? 6));
    setMaxReps(String(exercise.max_reps ?? 10));
    setInitialWeight(
      Number(exercise.initial_weight) > 0
        ? String(exercise.initial_weight).replace('.', ',')
        : ''
    );
    setError(null);
    setSaving(false);
  }, [exercise]);

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);

      const data = normalizeExerciseInput({
        name,
        defaultSets,
        minReps,
        maxReps,
        initialWeight,
      });

      await onSave(data);
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el ejercicio.');
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
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.title}>Editar ejercicio</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ej: Press banca"
              placeholderTextColor="#64748b"
              autoCapitalize="sentences"
              returnKeyType="next"
            />

            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Series</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={defaultSets}
                  onChangeText={setDefaultSets}
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Peso inicial (kg)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder="Opcional"
                  placeholderTextColor="#64748b"
                  value={initialWeight}
                  onChangeText={setInitialWeight}
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Mín. reps</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={minReps}
                  onChangeText={setMinReps}
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Máx. reps</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={maxReps}
                  onChangeText={setMaxReps}
                />
              </View>
            </View>

            <Text style={styles.hint}>
              Los cambios valen para este ejercicio en todos los días. Las series
              ya registradas no se modifican.
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
                  {saving ? 'Guardando...' : 'Guardar cambios'}
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
    padding: 20,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#111a15',
    borderWidth: 1,
    borderColor: '#1f3328',
    borderRadius: 16,
  },
  scrollContent: {
    padding: 18,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#ecfdf5',
  },
  closeButton: {
    padding: 6,
  },
  closeButtonText: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  input: {
    backgroundColor: '#090d0b',
    borderWidth: 1,
    borderColor: '#1f3328',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ecfdf5',
    fontSize: 15,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  halfInput: {
    flex: 1,
    gap: 4,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#94a3b8',
    marginTop: 2,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.55)',
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#090d0b',
    borderWidth: 1,
    borderColor: '#1f3328',
  },
  saveButton: {
    backgroundColor: '#059669',
  },
  cancelText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 14,
  },
  saveText: {
    color: '#ecfdf5',
    fontWeight: '800',
    fontSize: 14,
  },
});
