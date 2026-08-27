import React from "react";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
import { User } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import type { StaffLite } from "@/lib/api";

type Props = {
  staff: StaffLite[];
  onSelect: (staff: StaffLite) => void;
};

export function StaffPicker({ staff, onSelect }: Props) {
  return (
    <FlatList
      data={staff}
      keyExtractor={(s) => s.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => onSelect(item)}
        >
          <View style={styles.avatar}>
            <User size={22} color={colors.primary} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No staff found. Check the server connection.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  row: { gap: 12 },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardPressed: { backgroundColor: colors.slate100, borderColor: colors.primary },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slate100,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { flex: 1, fontSize: 16, color: colors.slate800, fontFamily: fonts.medium },
  empty: { textAlign: "center", color: colors.slate500, marginTop: 40, fontFamily: fonts.regular },
});
