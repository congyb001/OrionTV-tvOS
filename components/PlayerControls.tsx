import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Pause, Play, Gauge, Info, Settings, Moon, Volume2 } from "lucide-react-native";
import { MediaButton } from "@/components/MediaButton";
import { StyledButton } from "@/components/StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

import usePlayerStore from "@/stores/playerStore";
import useDetailStore from "@/stores/detailStore";

interface PlayerControlsProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
}

const formatTime = (milliseconds: number) => {
  if (!milliseconds || milliseconds < 0) return "00:00";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};

const formatRemaining = (ms: number | null) => {
  if (!ms || ms <= 0) return undefined;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  return m > 0 ? `${m}m` : `${total}s`;
};

/**
 * 播放页控制条，布局对齐芒果 TV：
 * 左下「第 N 期 + 剧名」→ 进度条（已播 / 剩余）→ 左侧「简介 / 音乐」标签，
 * 右侧一排圆形图标：播放暂停、简介信息、设置、睡眠定时、速度、音频。
 */
export const PlayerControls: React.FC<PlayerControlsProps> = ({ showControls }) => {
  const {
    currentEpisodeIndex,
    episodes,
    status,
    isSeeking,
    seekPosition,
    progressPosition,
    playbackRate,
    togglePlayPause,
    seek,
    activePanel,
    setActivePanel,
    sleepRemainingMs,
  } = usePlayerStore();

  const { detail } = useDetailStore();
  const { deviceType } = useResponsiveLayout();

  const progress = isSeeking ? seekPosition : progressPosition;
  const statusAny = status as any;
  const positionMillis = statusAny?.positionMillis || 0;
  const durationMillis = statusAny?.durationMillis || 0;
  const remaining = Math.max(0, durationMillis - positionMillis);
  const isPlaying = !!statusAny?.isPlaying;

  const hasEpisodes = episodes.length > 0;
  const epLabel = hasEpisodes ? `第 ${currentEpisodeIndex + 1} 期` : "影片";

  const onProgressPress = (event: any) => {
    if (deviceType === "tv" || !durationMillis) return;
    const { nativeEvent } = event;
    const ratio = Math.max(0, Math.min(1, nativeEvent.locationX / (nativeEvent.target?.clientWidth || 1)));
    seek(ratio * durationMillis - positionMillis);
  };

  const togglePanel = (panel: "info" | "settings" | "sleep" | "audio" | "music") =>
    setActivePanel(activePanel === panel ? null : panel);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.88)"]} style={styles.bottomBar}>
        {/* 期数 + 剧名 */}
        <View style={styles.titleBlock}>
          <Text style={styles.epLabel}>{epLabel}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {detail?.title || ""}
          </Text>
        </View>

        {/* 进度条：左已播 / 右剩余 */}
        <View style={styles.progressRow}>
          <Text style={styles.timeText}>{formatTime(positionMillis)}</Text>
          <Pressable style={styles.progressTrack} onPress={onProgressPress}>
            <View style={styles.progressBg} />
            <View style={[styles.progressFill, { width: `${Math.min(1, progress || 0) * 100}%` }]} />
          </Pressable>
          <Text style={[styles.timeText, styles.remainingText]}>-{formatTime(remaining)}</Text>
        </View>

        {/* 左侧标签 + 右侧圆形图标组 */}
        <View style={styles.actionRow}>
          <View style={styles.tabs}>
            <StyledButton
              text="简介"
              onPress={() => togglePanel("info")}
              isSelected={activePanel === "info"}
              style={styles.tabPill}
              textStyle={styles.tabText}
            />
            <StyledButton
              text="音乐"
              onPress={() => togglePanel("music")}
              isSelected={activePanel === "music"}
              style={styles.tabPill}
              textStyle={styles.tabText}
            />
          </View>

          <View style={styles.iconGroup}>
            <MediaButton
              onPress={togglePlayPause}
              hasTVPreferredFocus={showControls}
              style={styles.playButton}
              accessibilityLabel="播放/暂停"
            >
              {isPlaying ? <Pause color="white" size={30} /> : <Play color="white" size={30} />}
            </MediaButton>

            <MediaButton onPress={() => togglePanel("info")} accessibilityLabel="简介信息">
              <Info color="white" size={22} />
            </MediaButton>

            <MediaButton onPress={() => togglePanel("settings")} accessibilityLabel="播放设置">
              <Settings color="white" size={22} />
            </MediaButton>

            <MediaButton
              onPress={() => togglePanel("sleep")}
              accessibilityLabel="睡眠定时"
              timeLabel={formatRemaining(sleepRemainingMs)}
            >
              <Moon color={sleepRemainingMs ? "#FFD479" : "white"} size={22} />
            </MediaButton>

            <MediaButton
              onPress={() => togglePanel("audio")}
              accessibilityLabel="播放速度与音频"
              timeLabel={playbackRate !== 1.0 ? `${playbackRate}x` : undefined}
            >
              <Gauge color="white" size={22} />
            </MediaButton>

            <MediaButton onPress={() => togglePanel("audio")} accessibilityLabel="音频">
              <Volume2 color="white" size={22} />
            </MediaButton>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  bottomBar: {
    paddingHorizontal: 56,
    paddingBottom: 40,
    paddingTop: 90,
  },
  titleBlock: {
    marginBottom: 18,
  },
  epLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 17,
    marginBottom: 4,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  timeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    minWidth: 64,
  },
  remainingText: {
    textAlign: "right",
    minWidth: 88,
  },
  progressTrack: {
    flex: 1,
    height: 22,
    justifyContent: "center",
  },
  progressBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#39D98A",
  },
  actionRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tabs: {
    flexDirection: "row",
    gap: 12,
  },
  tabPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    minWidth: 96,
  },
  tabText: {
    fontSize: 17,
    fontWeight: "600",
  },
  iconGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playButton: {
    minWidth: 64,
    padding: 14,
    borderRadius: 32,
  },
});
