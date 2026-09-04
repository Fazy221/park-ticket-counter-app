import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Clock, CheckCircle2, XCircle, RotateCw, AlertTriangle } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts, type } from "@/theme/typography";
import { useAuth } from "@/context/AuthContext";
import { useDeviceConfig } from "@/hooks/useDeviceConfig";
import { useServerUrl } from "@/hooks/useServerUrl";
import { getTodaysScans, retryFailedItem, subscribeToQueueChanges } from "@/lib/queue";
import { fetchSessionLog, fetchStaffNames, SessionLogEntry, StaffLite } from "@/lib/api";
import type { PendingScanRow } from "@/lib/db";

export default function SessionLog() {
  const { token } = useAuth();
  const config = useDeviceConfig();
  const serverUrl = useServerUrl();

  const [queued, setQueued] = useState<PendingScanRow[]>([]);
  const [serverEvents, setServerEvents] = useState<SessionLogEntry[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const refreshQueued = useCallback(() => {
    getTodaysScans().then((rows) => setQueued(rows.filter((r) => r.status !== "synced")));
  }, []);

  const refreshServer = useCallback(async () => {
    if (!config || !serverUrl || !token) return;
    setServerError(null);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const params = {
      counter_id: config.counterId,
      from: startOfDay.toISOString(),
      to: new Date().toISOString(),
    };
    try {
      const [events, staff] = await Promise.all([
        fetchSessionLog(serverUrl, token, params),
        fetchStaffNames(serverUrl),
      ]);
      setServerEvents(events);
      const map: Record<string, string> = {};
      (staff as StaffLite[]).forEach((s) => (map[s.id] = s.name));
      setStaffMap(map);
    } catch (err) {
      console.log("[session-log] refreshServer failed", err);
      setServerError("Showing queued scans only - couldn't reach the server for today's full log.");
    }
  }, [config, serverUrl, token]);

  // Belt-and-suspenders: refetch both on a queue change (covers a
  // background sync completing while this tab happens to already be the
  // focused one) AND every time this tab gains focus (covers the much more
  // common case - scan on the Scan tab, switch to Session log - without
  // depending on the queue's pub/sub timing at all). Either one alone was
  // leaving a gap; together there's no path back to this screen that skips
  // a refetch.
  useEffect(() => {
    refreshQueued();
    refreshServer();
    return subscribeToQueueChanges(() => {
      refreshQueued();
      refreshServer();
    });
  }, [refreshQueued, refreshServer]);

  useFocusEffect(
    useCallback(() => {
      refreshQueued();
      refreshServer();
    }, [refreshQueued, refreshServer])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshServer();
    refreshQueued();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={serverEvents}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            {queued.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Queued</Text>
                {queued.map((row) => (
                  <QueuedRow key={row.id} row={row} />
                ))}
              </View>
            )}
            <Text style={styles.sectionTitle}>Today</Text>
            {serverError ? <Text style={styles.warning}>{serverError}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.event_type === "scanned" ? (
              <CheckCircle2 size={18} color={colors.success} />
            ) : (
              <XCircle size={18} color={colors.danger} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>
                {item.event_type === "scanned" ? "Scanned" : "Duplicate attempt"}
              </Text>
              <Text style={styles.rowSubtitle}>{staffMap[item.actor_staff_id] ?? "Unknown staff"}</Text>
            </View>
            <Text style={styles.rowTime}>
              {new Date(item.server_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          !serverError ? <Text style={styles.empty}>No scans yet today at this counter.</Text> : null
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

function QueuedRow({ row }: { row: PendingScanRow }) {
  const isFailed = row.status === "failed";
  return (
    <View style={styles.row}>
      {isFailed ? (
        <AlertTriangle size={18} color={colors.danger} />
      ) : (
        <Clock size={18} color={colors.pending} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{isFailed ? "Failed" : "Pending sync"}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {isFailed ? row.error : row.qr_code}
        </Text>
      </View>
      {isFailed ? (
        <Pressable style={styles.retryButton} onPress={() => retryFailedItem(row.id)} hitSlop={8}>
          <RotateCw size={16} color={colors.slate600} />
        </Pressable>
      ) : (
        <Text style={styles.rowTime}>
          {new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 16 },
  section: { marginTop: 12 },
  sectionTitle: {
    ...type.small,
    color: colors.slate500,
    fontFamily: fonts.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  warning: { color: colors.pending, fontFamily: fonts.medium, fontSize: 13, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, color: colors.slate900, fontFamily: fonts.medium },
  rowSubtitle: { fontSize: 12, color: colors.slate500, fontFamily: fonts.regular, marginTop: 1 },
  rowTime: { fontSize: 12, color: colors.slate400, fontFamily: fonts.medium },
  retryButton: { padding: 6, backgroundColor: colors.slate100, borderRadius: 8 },
  empty: { textAlign: "center", color: colors.slate400, marginTop: 40, fontFamily: fonts.regular },
});