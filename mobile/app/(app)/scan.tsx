import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Keyboard, RotateCcw, Undo2 } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts, type } from "@/theme/typography";
import { ScanResultCard } from "@/components/ScanResultCard";
import { ManualEntryModal } from "@/components/ManualEntryModal";
import { useAuth } from "@/context/AuthContext";
import { useDeviceConfig } from "@/hooks/useDeviceConfig";
import { enqueueScan, getScanById, subscribeToQueueChanges, syncPendingItems } from "@/lib/queue";
import { undoScan, fetchStaffNames, fetchCounters, StaffLite, CounterLite } from "@/lib/api";
import type { PendingScanRow } from "@/lib/db";

const UNDO_WINDOW_SECONDS = 120;

export default function Scan() {
  const { staff, token } = useAuth();
  const config = useDeviceConfig();
  const [permission, requestPermission] = useCameraPermissions();

  const [manualEntryVisible, setManualEntryVisible] = useState(false);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [activeRow, setActiveRow] = useState<PendingScanRow | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState<number | null>(null);

  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [counterMap, setCounterMap] = useState<Record<string, string>>({});

  const scanLocked = useRef(false);

  // Small directory lookup for showing names (not IDs) on the "already
  // redeemed" card. Best-effort - if this fails (offline at the moment of
  // mount) the card just shows fewer details, it's not load-bearing.
  useEffect(() => {
    if (!config) return;
    fetchStaffNames(config.serverUrl)
      .then((list: StaffLite[]) => {
        const map: Record<string, string> = {};
        list.forEach((s) => (map[s.id] = s.name));
        setStaffMap(map);
      })
      .catch(() => {});
    fetchCounters(config.serverUrl)
      .then((list: CounterLite[]) => {
        const map: Record<string, string> = {};
        list.forEach((c) => (map[c.id] = c.name));
        setCounterMap(map);
      })
      .catch(() => {});
  }, [config]);

  // Watch the active scan row until it resolves.
  useEffect(() => {
    if (activeScanId == null) return;
    const refresh = () => {
      getScanById(activeScanId).then((row) => row && setActiveRow(row));
    };
    refresh();
    return subscribeToQueueChanges(refresh);
  }, [activeScanId]);

  // Undo countdown, only while the active result is a confirmed valid scan.
  useEffect(() => {
    if (!activeRow || activeRow.status !== "synced" || activeRow.result_status !== "valid") {
      setUndoSecondsLeft(null);
      return;
    }
    const scannedAt = new Date(activeRow.synced_at ?? activeRow.created_at).getTime();
    const tick = () => {
      const remaining = UNDO_WINDOW_SECONDS - Math.floor((Date.now() - scannedAt) / 1000);
      setUndoSecondsLeft(remaining > 0 ? remaining : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeRow]);

  const handleCode = useCallback(
    async (code: string) => {
      if (scanLocked.current || !config || !staff) return;
      scanLocked.current = true;
      setManualEntryVisible(false);

      const id = await enqueueScan({
        qr_code: code,
        counter_id: config.counterId,
        staff_id: staff.id,
        device_scan_time: new Date().toISOString(),
      });
      setActiveScanId(id);
      // Try to resolve immediately if we're online, instead of waiting
      // for the next background tick - this is what makes an online scan
      // feel instant rather than always showing "Pending sync" first.
      syncPendingItems(config.serverUrl).catch(() => {});
    },
    [config, staff]
  );

  const scanNext = () => {
    setActiveScanId(null);
    setActiveRow(null);
    scanLocked.current = false;
  };

  const handleUndo = async () => {
    if (!config || !token || !activeRow?.result_json) return;
    const result = JSON.parse(activeRow.result_json);
    if (!result.ticket_id) return;
    setUndoing(true);
    try {
      await undoScan(config.serverUrl, token, result.ticket_id);
      scanNext();
    } catch {
      // Leave the result on screen - most likely the 2-minute window
      // just closed server-side between ticks. Nothing silently lost.
    } finally {
      setUndoing(false);
    }
  };

  if (!config) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>GateMark needs camera access to scan tickets.</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant camera access</Text>
        </Pressable>
        <Pressable style={styles.manualLinkStandalone} onPress={() => setManualEntryVisible(true)}>
          <Text style={styles.manualLinkText}>Enter code manually instead</Text>
        </Pressable>
        <ManualEntryModal
          visible={manualEntryVisible}
          onCancel={() => setManualEntryVisible(false)}
          onSubmit={handleCode}
        />
      </View>
    );
  }

  const resultProps = resultCardProps(activeRow, staffMap, counterMap);

  return (
    <View style={styles.container}>
      {!activeRow ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => handleCode(data)}
          />
          <View style={styles.frameOverlay} pointerEvents="none">
            <View style={styles.frame} />
            <Text style={styles.frameHint}>Point at the ticket's QR code</Text>
          </View>
          <Pressable style={styles.manualButton} onPress={() => setManualEntryVisible(true)}>
            <Keyboard size={18} color={colors.white} />
            <Text style={styles.manualButtonText}>Enter code manually</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.resultWrap}>
          {resultProps ? <ScanResultCard {...resultProps} /> : null}

          {undoSecondsLeft !== null && undoSecondsLeft > 0 && (
            <Pressable
              style={[styles.undoButton, undoing && styles.disabled]}
              onPress={handleUndo}
              disabled={undoing}
            >
              <Undo2 size={18} color={colors.slate700} />
              <Text style={styles.undoText}>
                {undoing ? "Undoing..." : `Undo (${undoSecondsLeft}s)`}
              </Text>
            </Pressable>
          )}

          <Pressable style={styles.primaryButton} onPress={scanNext}>
            <RotateCcw size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Scan next</Text>
          </Pressable>
        </View>
      )}

      <ManualEntryModal
        visible={manualEntryVisible}
        onCancel={() => setManualEntryVisible(false)}
        onSubmit={handleCode}
      />
    </View>
  );
}

function resultCardProps(
  row: PendingScanRow | null,
  staffMap: Record<string, string>,
  counterMap: Record<string, string>
) {
  if (!row) return null;

  if (row.status === "pending" || row.status === "syncing") {
    return { state: "pending" as const };
  }

  if (row.status === "failed") {
    // Rejected outright by the server (not a connectivity problem, which
    // would leave it "pending" instead) - a real error, not a ticket
    // status, so it gets its own card rather than being dressed up as a
    // duplicate/void result.
    return { state: "failed" as const, message: row.error };
  }

  if (row.status === "synced" && row.result_json) {
    const result = JSON.parse(row.result_json);
    if (row.result_status === "valid") {
      return { state: "valid" as const, assignedNumber: result.assigned_number };
    }
    return {
      state: "duplicate" as const,
      originalStatus: row.result_status as "redeemed" | "void",
      originalStaffName: result.original_staff_id ? staffMap[result.original_staff_id] : undefined,
      originalCounterName: result.original_counter_id
        ? counterMap[result.original_counter_id]
        : undefined,
      originalScannedAt: result.original_scanned_at,
    };
  }

  return { state: "pending" as const };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.slate900 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  permissionText: { ...type.body, color: colors.slate700, textAlign: "center", fontFamily: fonts.regular },
  cameraWrap: { flex: 1 },
  frameOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: 24,
    opacity: 0.85,
  },
  frameHint: {
    marginTop: 16,
    color: colors.white,
    fontFamily: fonts.medium,
    backgroundColor: "rgba(15,23,42,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  manualButton: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(15,23,42,0.65)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  manualButtonText: { color: colors.white, fontFamily: fonts.medium },
  manualLinkStandalone: { marginTop: 8 },
  manualLinkText: { color: colors.primary, fontFamily: fonts.medium },
  resultWrap: { flex: 1, backgroundColor: colors.white, padding: 20, justifyContent: "center", gap: 16 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontFamily: fonts.semibold },
  undoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.slate100,
  },
  undoText: { color: colors.slate700, fontFamily: fonts.semibold },
  disabled: { opacity: 0.6 },
});
