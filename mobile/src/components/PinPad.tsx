import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Delete } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
const MAX_PIN_LENGTH = 8;
const MIN_PIN_LENGTH = 4;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string | null;
};

export function PinPad({ value, onChange, onSubmit, submitting, error }: Props) {
  const canSubmit = value.length >= MIN_PIN_LENGTH && !submitting;

  const press = (key: string) => {
    if (key === "del") {
      onChange(value.slice(0, -1));
    } else if (key && value.length < MAX_PIN_LENGTH) {
      onChange(value + key);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {Array.from({ length: Math.max(value.length, MIN_PIN_LENGTH) }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < value.length ? styles.dotFilled : styles.dotEmpty,
            ]}
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.grid}>
        {KEYS.map((key, i) => {
          if (key === "") return <View key={i} style={styles.key} />;
          return (
            <Pressable
              key={i}
              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              onPress={() => press(key)}
              accessibilityLabel={key === "del" ? "Delete" : key}
            >
              {key === "del" ? (
                <Delete size={24} color={colors.slate700} />
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.submit,
          !canSubmit && styles.submitDisabled,
          pressed && canSubmit && styles.submitPressed,
        ]}
        onPress={onSubmit}
        disabled={!canSubmit}
      >
        <Text style={styles.submitText}>{submitting ? "Checking..." : "Enter"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", width: "100%" },
  dotsRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  dotFilled: { backgroundColor: colors.primary },
  dotEmpty: { backgroundColor: colors.slate200, borderWidth: 1, borderColor: colors.slate300 },
  error: { color: colors.danger, marginTop: 12, fontFamily: fonts.medium },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 264,
    marginTop: 28,
    justifyContent: "center",
  },
  key: {
    width: 80,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    margin: 4,
    borderRadius: 12,
    backgroundColor: colors.slate50,
  },
  keyPressed: { backgroundColor: colors.slate200 },
  keyText: { fontSize: 26, color: colors.slate800, fontFamily: fonts.medium },
  submit: {
    marginTop: 20,
    width: 264,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitDisabled: { backgroundColor: colors.slate300 },
  submitPressed: { backgroundColor: colors.primaryDark },
  submitText: { color: colors.white, fontSize: 16, fontFamily: fonts.semibold },
});
