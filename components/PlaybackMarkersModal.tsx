import React from "react";
import { View, Text, StyleSheet, Modal, ScrollView } from "react-native";
import { StyledButton } from "./StyledButton";
import usePlayerStore from "@/stores/playerStore";

const formatTime = (ms?: number) => {
  if (!ms || ms <= 0) return "未设置";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/**
 * 片头 / 上集回顾 / 片尾 标记设置。
 * 用法：把进度条拖到"片头结束"的位置，点对应那一行的"设为当前位置"即可。
 */
export const PlaybackMarkersModal: React.FC = () => {
  const {
    showMarkersModal,
    setShowMarkersModal,
    status,
    recapEndTime,
    introEndTime,
    outroStartTime,
    setMarkerAtCurrentPosition,
    clearMarker,
  } = usePlayerStore();

  const close = () => setShowMarkersModal(false);
  const current: any = status?.isLoaded ? (status as any) : null;
  const position = current?.positionMillis || 0;

  return (
    <Modal visible={showMarkersModal} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>片头 / 片尾 / 上集回顾</Text>
          <Text style={styles.hint}>当前位置 {formatTime(position)}。把进度拖到断点，再点对应按钮记录。</Text>

          <ScrollView style={styles.list}>
            <Row
              label="上集回顾结束"
              value={formatTime(recapEndTime)}
              onSet={() => setMarkerAtCurrentPosition("recap")}
              onClear={() => clearMarker("recap")}
            />
            <Row
              label="片头结束"
              value={formatTime(introEndTime)}
              onSet={() => setMarkerAtCurrentPosition("intro")}
              onClear={() => clearMarker("intro")}
            />
            <Row
              label="片尾开始（距结尾）"
              value={formatTime(outroStartTime)}
              onSet={() => setMarkerAtCurrentPosition("outro")}
              onClear={() => clearMarker("outro")}
            />
          </ScrollView>

          <View style={styles.footer}>
            <StyledButton text="关闭" variant="primary" onPress={close} style={styles.closeButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const Row: React.FC<{
  label: string;
  value: string;
  onSet: () => void;
  onClear: () => void;
}> = ({ label, value, onSet, onClear }) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
    <View style={styles.rowActions}>
      <StyledButton text="设为当前位置" onPress={onSet} style={styles.actionButton} />
      <StyledButton text="清除" variant="ghost" onPress={onClear} style={styles.actionButton} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panel: {
    width: 620,
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    padding: 24,
  },
  title: { color: "white", fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  hint: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginBottom: 16, lineHeight: 20 },
  list: { flex: 1 },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.18)",
  },
  rowText: { flexDirection: "row", alignItems: "baseline", marginBottom: 10 },
  rowLabel: { color: "white", fontSize: 16, fontWeight: "600", marginRight: 10 },
  rowValue: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
  rowActions: { flexDirection: "row", gap: 10 },
  actionButton: { paddingHorizontal: 12, paddingVertical: 8 },
  footer: { marginTop: 16, alignItems: "flex-end" },
  closeButton: { paddingHorizontal: 28 },
});
