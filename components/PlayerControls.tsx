import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Pause, Play, Gauge, List, Tv, SkipForward, Scissors } from "lucide-react-native";
import { MediaButton } from "@/components/MediaButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

import usePlayerStore from "@/stores/playerStore";
import useDetailStore from "@/stores/detailStore";
import { useSources } from "@/stores/sourceStore";

interface PlayerControlsProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
}

const SEEK_STEP = 10 * 1000; // 快进/快退 10 秒

const formatTime = (milliseconds: number) => {
  if (!milliseconds || milliseconds < 0) return "00:00";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};

export const PlayerControls: React.FC<PlayerControlsProps> = ({ showControls, setShowControls }) => {
  const {
    currentEpisodeIndex,
    episodes,
    status,
    isSeeking,
    seekPosition,
    progressPosition,
    playbackRate,
    togglePlayPause,
    playEpisode,
    setShowEpisodeModal,
    setShowSourceModal,
    setShowSpeedModal,
    setShowMarkersModal,
    seek,
  } = usePlayerStore();

  const { detail } = useDetailStore();
  const resources = useSources();
  const { deviceType } = useResponsiveLayout();

  const videoTitle = detail?.title || "";
  const currentEpisode = episodes[currentEpisodeIndex];
  const currentEpisodeTitle = currentEpisode?.title;
  const currentSource = resources.find((r) => r.source === detail?.source);
  const currentSourceName = currentSource?.source_name;
  const hasNextEpisode = currentEpisodeIndex < (episodes.length || 0) - 1;

  const onPlayNextEpisode = () => {
    if (hasNextEpisode) {
      playEpisode(currentEpisodeIndex + 1);
    }
  };

  const progress = isSeeking ? seekPosition : progressPosition;
  const statusAny = status as any;
  const positionMillis = statusAny?.positionMillis || 0;
  const durationMillis = statusAny?.durationMillis || 0;

  // 触摸/鼠标拖动的进度条（TV 上主要由遥控器控制）
  const onProgressPress = (event: any) => {
    if (deviceType === "tv" || !durationMillis) return;
    const { nativeEvent } = event;
    const ratio = Math.max(0, Math.min(1, nativeEvent.locationX / nativeEvent.target?.clientWidth || 0));
    seek(ratio * durationMillis - positionMillis);
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* 顶部：片名 + 集数，Emby 风格左对齐小字 */}
      <LinearGradient colors={["rgba(0,0,0,0.78)", "rgba(0,0,0,0)"]} style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {videoTitle}
          {currentEpisodeTitle ? `  ·  ${currentEpisodeTitle}` : ""}
        </Text>
        {currentSourceName ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {currentSourceName}
          </Text>
        ) : null}
      </LinearGradient>

      {/* 底部：进度 + 按钮组 */}
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.92)"]} style={styles.bottomBar}>
        <View style={styles.progressRow}>
          <Text style={styles.timeText}>{formatTime(positionMillis)}</Text>
          <Pressable style={styles.progressTrack} onPress={onProgressPress}>
            <View style={styles.progressBg} />
            <View style={[styles.progressFill, { width: `${Math.min(1, progress || 0) * 100}%` }]} />
          </Pressable>
          <Text style={styles.timeText}>-{formatTime(Math.max(0, durationMillis - positionMillis))}</Text>
        </View>

        <View style={styles.buttonsRow}>
          <MediaButton
            onPress={togglePlayPause}
            hasTVPreferredFocus={showControls}
            style={styles.playButton}
            accessibilityLabel="播放/暂停"
          >
            {status?.isLoaded && status.isPlaying ? <Pause color="white" size={32} /> : <Play color="white" size={32} />}
          </MediaButton>

          <MediaButton onPress={onPlayNextEpisode} disabled={!hasNextEpisode} accessibilityLabel="下一集">
            <SkipForward color={hasNextEpisode ? "white" : "#5A5A5A"} size={26} />
          </MediaButton>

          <View style={styles.divider} />

          <MediaButton onPress={() => setShowEpisodeModal(true)} accessibilityLabel="选集">
            <List color="white" size={24} />
          </MediaButton>

          <MediaButton
            onPress={() => setShowSpeedModal(true)}
            timeLabel={playbackRate !== 1.0 ? `${playbackRate}x` : undefined}
            accessibilityLabel="倍速"
          >
            <Gauge color="white" size={24} />
          </MediaButton>

          <MediaButton onPress={() => setShowSourceModal(true)} accessibilityLabel="切换源">
            <Tv color="white" size={24} />
          </MediaButton>

          <MediaButton onPress={() => setShowMarkersModal(true)} accessibilityLabel="设置片头片尾">
            <Scissors color="white" size={24} />
          </MediaButton>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    paddingHorizontal: 56,
    paddingTop: 40,
    paddingBottom: 60,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "600",
  },
  subtitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 17,
    marginTop: 6,
  },
  bottomBar: {
    paddingHorizontal: 56,
    paddingBottom: 44,
    paddingTop: 60,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  timeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    minWidth: 68,
    textAlign: "center",
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
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  buttonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
  },
  playButton: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    minWidth: 76,
    marginHorizontal: 6,
  },
  divider: {
    width: 1,
    height: 26,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginHorizontal: 10,
  },
});
