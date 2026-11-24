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
import { getDatabase } from '../db/database';
import { parseBackup, restoreBackup, summarizeBackup } from '../db/backup';
import { radius, spacing } from '../constants/app-theme';
import { formatDateShort, formatNumber } from '../utils/format';
import { useStyles } from './theme-provider';

/**
 * Restaura una copia de seguridad pegando su texto. Funciona en dos pasos:
 * primero se revisa la copia (qué contiene) y recién después, con un botón
 * aparte, se reemplazan los datos actuales.
 */
export default function RestoreBackupModal({ visible, onClose, onRestored }) {
  const { styles, colors } = useStyles(createStyles);
  const [text, setText] = useState('');
  const [backup, setBackup] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setText('');
      setBackup(null);
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const summary = backup ? summarizeBackup(backup) : null;

  const handleReview = () => {
    try {
      setError(null);
      setBackup(parseBackup(text));
    } catch (err) {
      setBackup(null);
      setError(err?.message || 'No se pudo leer la copia de seguridad.');
    }
  };

  const handleRestore = async () => {
    if (!backup || busy) return;
    try {
      setBusy(true);
      setError(null);
      const db = await getDatabase();
      await restoreBackup(db, backup);
      await onRestored?.();
      onClose();
    } catch (err) {
      console.error('Error restaurando la copia:', err);
      setError(
        'No se pudo restaurar la copia. Tus datos actuales no se modificaron.'
      );
    } finally {
      setBusy(false);
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
            <Text style={styles.title}>Restaurar copia de seguridad</Text>

            {!backup || !summary ? (
              <>
                <Text style={styles.hint}>
                  Pegá acá el texto de la copia que exportaste desde Ajustes →
                  Respaldo.
                </Text>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={(value) => {
                    setText(value);
                    setError(null);
                  }}
                  placeholder="Pegá la copia de seguridad"
                  placeholderTextColor={colors.textFaint}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlignVertical="top"
                />
              </>
            ) : (
              <>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>Copia lista para restaurar</Text>
                  <Text style={styles.summaryText}>
                    {summary.createdAt
                      ? `Hecha el ${formatDateShort(
                          String(summary.createdAt).slice(0, 10)
                        )} · `
                      : ''}
                    {formatNumber(summary.routines)} días,{' '}
                    {formatNumber(summary.exercises)} ejercicios,{' '}
                    {formatNumber(summary.sessions)} sesiones y{' '}
                    {formatNumber(summary.sets)} series.
                  </Text>
                </View>
                <View style={styles.warnBox}>
                  <Text style={styles.warnText}>
                    Al restaurar se reemplazan todos tus datos actuales (rutinas,
                    ejercicios, historial y ajustes). Esta acción no se puede
                    deshacer.
                  </Text>
                </View>
              </>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={backup ? () => setBackup(null) : onClose}
                disabled={busy}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>{backup ? 'Atrás' : 'Cancelar'}</Text>
              </TouchableOpacity>

              {backup ? (
                <TouchableOpacity
                  style={[styles.button, styles.dangerButton, busy && styles.busy]}
                  onPress={handleRestore}
                  disabled={busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmText}>
                    {busy ? 'Restaurando...' : 'Reemplazar mis datos'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.confirmButton,
                    !text.trim() && styles.busy,
                  ]}
                  onPress={handleReview}
                  disabled={!text.trim()}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmText}>Revisar copia</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
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
      borderRadius: radius.lg,
    },
    content: {
      padding: 18,
      gap: spacing.md,
    },
    title: {
      color: colors.text,
      fontSize: 19,
      fontWeight: '800',
    },
    hint: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    input: {
      minHeight: 140,
      maxHeight: 220,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 12,
    },
    summaryBox: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 4,
    },
    summaryTitle: {
      color: colors.primaryText,
      fontSize: 14,
      fontWeight: '800',
    },
    summaryText: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    warnBox: {
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    warnText: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 18,
    },
    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      borderRadius: radius.md,
      padding: 10,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 18,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: spacing.xs,
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
    confirmButton: {
      backgroundColor: colors.primaryStrong,
    },
    dangerButton: {
      backgroundColor: colors.dangerStrong,
    },
    busy: {
      opacity: 0.55,
    },
    cancelText: {
      color: colors.textSecondary,
      fontWeight: '700',
      fontSize: 14,
    },
    confirmText: {
      color: colors.onPrimary,
      fontWeight: '800',
      fontSize: 14,
    },
  });
