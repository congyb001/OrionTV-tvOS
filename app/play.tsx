import React, { useEffect, useState } from "react";
import { StyleSheet, BackHandler, View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import NativeAVPlayerView from "@/modules/av-player-view";
import useDetailStore from "@/stores/detailStore";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import { stopActivePlayback } from "@/utils/playbackGuard";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("PlayScreen");

/**
 * 播放页：只渲染原生 AVPlayerViewController。
 * 界面、传输条、进度、快进快退、播放暂停全部交给 tvOS 原生播放器，
 * RN 侧只负责取片源地址、回传进度（用于「接着上次看」）。
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
  const [isReady, setIsReady] = useState(false);

  // 载入片源：沿用原来的 loadVideo，拿到集数、当前集地址和续播位置
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

  // 进度回传：把原生播放器的位置写回 store，供「接着上次看」和播放记录使用
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
    if (!isReady) setIsReady(true);
  };

  // 返回：记录播放位置后退出到详情页
  useEffect(() => {
    let lastBackAt = 0;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const now = Date.now();
      if (now - lastBackAt < 400) return true;
      lastBackAt = now;

      try {
        usePlayerStore.getState()._savePlayRecord(undefined, { immediate: true });
      } catch {
        // 记录失败不影响退出
      }
      stopActivePlayback().catch(() => {});
      router.back();
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  if (!currentEpisode?.url) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#ffffff" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NativeAVPlayerView
        style={StyleSheet.absoluteFill}
        url={currentEpisode.url}
        initialPositionMs={initialPosition || 0}
        autoPlay
        onProgress={onProgress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
});
