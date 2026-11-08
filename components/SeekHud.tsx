import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import usePlayerStore from "@/stores/playerStore";

/**
 * Infuse 风格的快进提示层：
 * 左右键跳转时只在屏幕中间弹出一块 HUD（跳转方向、跳了多久、已播/剩余时间、进度），
 * 不把整条控制条调出来，避免打断观影。
 */
export const SeekHud: React.FC = () => {
  const { status, seekHudVisible, seekHudDelta } = usePlayerStore();

  const loaded: any = status?.isLoaded ? (status as any) : null;
  if (!loaded || !seekHudVisible) return null;

  const position = loaded.positionMillis || 0;
  const duration = loaded.durationMillis || 0;
  const ratio = duration ? Math.max(0, Math.min(1, position / duration)) : 0;

  const pad = (n: number) => n.toString().padStart(2, "0");
  const fmt = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const forward = seekHudDelta >= 0;
  const seconds = Math.abs(Math.round(seekHudDelta / 1000));

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.card}>
        <View style={styles.directionRow}>
          {forward ? <ChevronRight color="white" size={34} /> : <ChevronLeft color="white" size={34} />}
          <Text style={styles.directionText}>
            {forward ? "快进" : "快退"} {seconds} 秒
          </Text>
        </View>

        <View style={styles.track}>
          <View style={styles.trackBg} />
          <View style={[styles.trackFill, { width: `${ratio * 100}%` }]} />
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{fmt(position)}</Text>
          <Text style={styles.timeText}>-{fmt(Math.max(0, duration - position))}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: 620,
    paddingHorizontal: 36,
    paddingVertical: 26,
    borderRadius: 20,
    backgroundColor: "rgba(18,18,18,0.82)",
  },
  directionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20,
  },
  directionText: {
    color: "white",
    fontSize: 26,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 6,
    justifyContent: "center",
  },
  trackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "white",
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  timeText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 17,
    fontVariant: ["tabular-nums"],
  },
});
