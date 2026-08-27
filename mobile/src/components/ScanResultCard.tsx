import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react-native";
import { colors, scanStateColors, ScanState } from "@/theme/colors";
import { fonts, type } from "@/theme/typography";

type Props =
  | { state: "valid"; assignedNumber: number }
  | {
      state: "duplicate";
      originalStatus: "redeemed" | "void";
      originalStaffName?: string;
      originalCounterName?: string;
      originalScannedAt?: string | null;
    }
  | { state: "pending" }
  | { state: "failed"; message?: string | null };

export function ScanResultCard(props: Props) {
  const tone = scanStateColors[props.state as Exclude<ScanState, "idle">];

  return (
    <View style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      {props.state === "valid" && (
        <>
          <CheckCircle2 size={40} color={tone.fg} />
          <Text style={[styles.title, { color: tone.fg }]}>Valid</Text>
          <Text style={styles.calloutLabel}>Assigned number</Text>
          <Text style={[styles.callout, { color: tone.fg }]}>{props.assignedNumber}</Text>
        </>
      )}

      {props.state === "duplicate" && (
        <>
          <XCircle size={40} color={tone.fg} />
          <Text style={[styles.title, { color: tone.fg }]}>
            {props.originalStatus === "void" ? "Void ticket" : "Already redeemed"}
          </Text>
          <View style={styles.detailBlock}>
            {props.originalStaffName ? (
              <Text style={styles.detailLine}>By {props.originalStaffName}</Text>
            ) : null}
            {props.originalCounterName ? (
              <Text style={styles.detailLine}>At {props.originalCounterName}</Text>
            ) : null}
            {props.originalScannedAt ? (
              <Text style={styles.detailLine}>
                {new Date(props.originalScannedAt).toLocaleString()}
              </Text>
            ) : null}
          </View>
        </>
      )}

      {props.state === "pending" && (
        <>
          <Clock size={40} color={tone.fg} />
          <Text style={[styles.title, { color: tone.fg }]}>Pending sync</Text>
          <Text style={styles.detailLine}>
            No connection to the server right now - this scan is queued and will confirm once
            reconnected.
          </Text>
        </>
      )}

      {props.state === "failed" && (
        <>
          <AlertTriangle size={40} color={tone.fg} />
          <Text style={[styles.title, { color: tone.fg }]}>Scan failed</Text>
          <Text style={styles.detailLine}>
            {props.message ?? "The server rejected this scan. Check the session log to retry."}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  title: { ...type.h2, fontFamily: fonts.bold, marginTop: 4 },
  calloutLabel: {
    ...type.small,
    color: colors.slate600,
    fontFamily: fonts.medium,
    marginTop: 10,
  },
  callout: { ...type.callout, fontFamily: fonts.bold },
  detailBlock: { alignItems: "center", marginTop: 6, gap: 2 },
  detailLine: {
    ...type.body,
    color: colors.slate700,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
});
