import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  BackHandler,
  View,
  ActivityIndicator,
  Pressable,
  Text,
  Modal,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import NativeAVPlayerView from "@/modules/av-player-view";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import useDetailStore from "@/stores/detailStore";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import { stopActivePlayback } from "@/utils/playbackGuard";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("PlayScreen");

/**
 * 播放页：画面由原生 AVPlayerViewController 出（原生播放、原生进度与解码），
 * 画面上叠一层 RN 按钮条，补上原生播放器不自带的「简介 / 选集 / 下一集」。
 */
export default function PlayScreen() {
  useKeepAwake();
  const router = useRouter();

  const {
    episodeIndex: episodeIndexStr,
    position: positionStr,
    source: sourceStr,
    id: videoId,
    title: videoTitle,
  } = useLocalSearchParams<{
    episodeIndex: string;
    position?: string;
    source?: string;
    id?: string;
    title?: string;
  }>();

  const episodeIndex = parseInt(episodeIndexStr || "0", 10);
  const position = positionStr ? parseInt(positionStr, 10) : undefined;

  const { detail } = useDetailStore();
  const source = sourceStr || detail?.source;
  const id = videoId || detail?.id?.toString();
  const title = videoTitle || detail?.title;

  const { initialPosition, loadVideo, reset, handlePlaybackStatusUpdate } = usePlayerStore();
  const currentEpisode = usePlayerStore(selectCurrentEpisode);
  const episodes = usePlayerStore((s) => s.episodes);
  const currentEpisodeIndex = usePlayerStore((s) => s.currentEpisodeIndex);
  const playEpisode = usePlayerStore((s) => s.playEpisode);
  const setShowEpisodeModal = usePlayerStore((s) => s.setShowEpisodeModal);

  const [descVisible, setDescVisible] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const hasNextEpisode =
    currentEpisodeIndex >= 0 && episodes.length > 1 && currentEpisodeIndex < episodes.length - 1;

  useEffect(() => {
    stopActivePlayback().catch(() => {});
    if (source && id && title) {
      loadVideo({ source, id, episodeIndex, position, title }).catch((e: any) => {
        logger.error(`loadVideo failed: ${e?.message || e}`);
      });
    }
  }, [episodeIndex, source, position, loadVideo, id, title]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const onProgress = (event: any) => {
    const payload = event?.nativeEvent || {};
    const positionMillis = payload.positionMillis ?? 0;
    const durationMillis = payload.durationMillis ?? 0;
    if (!durationMillis) return;
    handlePlaybackStatusUpdate({
      isLoaded: true,
      positionMillis,
      durationMillis,
      isPlaying: !!payload.isPlaying,
      didJustFinish: false,
      isBuffering: false,
      playbackRate: 1.0,
      shouldPlay: !!payload.isPlaying,
    } as any);
  };

  useEffect(() => {
    let lastBackAt = 0;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const now = Date.now();
      if (now - lastBackAt < 400) return true;
      lastBackAt = now;

      if (descVisible) {
        setDescVisible(false);
        return true;
      }
      if (usePlayerStore.getState().showEpisodeModal) {
        setShowEpisodeModal(false);
        return true;
      }

      try {
        usePlayerStore.getState()._savePlayRecord(undefined, { immediate: true });
      } catch {
        // 忽略
      }
      stopActivePlayback().catch(() => {});
      router.back();
      return true;
    });
    return () => subscription.remove();
  }, [router, descVisible, setShowEpisodeModal]);

  if (!currentEpisode?.url) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#ffffff" size="large" />
        <Text style={styles.status}>正在解析片源…</Text>
      </View>
    );
  }

  const renderButton = (key: string, label: string, onPress: () => void) => {
    const focused = focusedKey === key;
    return (
      <Pressable
        key={key}
        onFocus={() => setFocusedKey(key)}
        onBlur={() => setFocusedKey((k) => (k === key ? null : k))}
        onPress={onPress}
        style={[styles.button, focused && styles.buttonFocused]}
      >
        <Text style={[styles.buttonText, focused && styles.buttonTextFocused]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.playerContainer}>
      <NativeAVPlayerView
        style={StyleSheet.absoluteFill}
        url={currentEpisode.url}
        initialPositionMs={initialPosition || 0}
        autoPlay
        onProgress={onProgress}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.buttonRow}>
          {renderButton("desc", "简介", () => setDescVisible(true))}
          {episodes.length > 1 && renderButton("episodes", "选集", () => setShowEpisodeModal(true))}
          {hasNextEpisode && renderButton("next", "下一集", () => playEpisode(currentEpisodeIndex + 1))}
        </View>
      </View>

      <Modal visible={descVisible} transparent animationType="fade" onRequestClose={() => setDescVisible(false)}>
        <View style={styles.descMask}>
          <View style={styles.descCard}>
            <Text style={styles.descTitle}>{detail?.title || title || "简介"}</Text>
            <ScrollView>
              <Text style={styles.descText}>{detail?.desc || "暂无简介"}</Text>
            </ScrollView>
            <Pressable style={styles.descClose} onPress={() => setDescVisible(false)}>
              <Text style={styles.descCloseText}>关闭</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <EpisodeSelectionModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
    alignItems: "center",
    justifyContent: "center",
  },
  playerContainer: {
    flex: 1,
    backgroundColor: "black",
  },
  status: {
    marginTop: 24,
    color: "#cccccc",
    fontSize: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingRight: 60,
    paddingBottom: 70,
  },
  buttonRow: {
    flexDirection: "row",
  },
  button: {
    marginLeft: 20,
    paddingHorizontal: 36,
    paddingVertical: 18,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  buttonFocused: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "#ffffff",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "600",
  },
  buttonTextFocused: {
    color: "#111111",
  },
  descMask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 80,
  },
  descCard: {
    width: "72%",
    maxHeight: "72%",
    borderRadius: 18,
    backgroundColor: "#141414",
    padding: 40,
  },
  descTitle: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "700",
    marginBottom: 20,
  },
  descText: {
    color: "#dddddd",
    fontSize: 24,
    lineHeight: 36,
  },
  descClose: {
    alignSelf: "flex-end",
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  descCloseText: {
    color: "#ffffff",
    fontSize: 24,
  },
});
