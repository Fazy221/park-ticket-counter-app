import React, { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (code: string) => void;
};

export function ManualEntryModal({ visible, onCancel, onSubmit }: Props) {
  const [code, setCode] = useState("");

  const submit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setCode("");
    onSubmit(trimmed);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Enter code manually</Text>
          <Text style={styles.subtitle}>For a damaged or unreadable QR code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="Ticket code"
            placeholderTextColor={colors.slate400}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={submit}
          />
          <View style={styles.row}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.submitButton, !code.trim() && styles.disabled]}
              onPress={submit}
              disabled={!code.trim()}
            >
              <Text style={styles.submitText}>Check ticket</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  title: { fontSize: 18, color: colors.slate900, fontFamily: fonts.semibold },
  subtitle: { fontSize: 13, color: colors.slate500, fontFamily: fonts.regular, marginTop: 2 },
  input: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.slate900,
    fontFamily: fonts.medium,
  },
  row: { flexDirection: "row", gap: 12, marginTop: 20 },
  button: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancelButton: { backgroundColor: colors.slate100 },
  cancelText: { color: colors.slate700, fontFamily: fonts.medium },
  submitButton: { backgroundColor: colors.primary },
  disabled: { backgroundColor: colors.slate300 },
  submitText: { color: colors.white, fontFamily: fonts.semibold },
});
