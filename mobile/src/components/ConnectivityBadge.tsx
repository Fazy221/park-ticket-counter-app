import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Wifi, WifiOff } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import { useConnectivity } from "@/hooks/useConnectivity";
import { usePendingCount } from "@/hooks/usePendingCount";

export function ConnectivityBadge() {
  const connected = useConnectivity();
  const pendingCount = usePendingCount();

  return (
    <View
      style={[
        styles.badge,
        connected ? styles.badgeConnected : styles.badgeOffline,
      ]}
    >
      {connected ? (
        <Wifi size={14} color={colors.success} />
      ) : (
        <WifiOff size={14} color={colors.danger} />
      )}
      <Text style={[styles.text, { color: connected ? colors.success : colors.danger }]}>
        {connected ? "Connected" : "Offline"}
        {pendingCount > 0 ? ` \u00b7 ${pendingCount} queued` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeConnected: { backgroundColor: colors.successBg },
  badgeOffline: { backgroundColor: colors.dangerBg },
  text: { fontSize: 12, fontFamily: fonts.medium },
});
