import React, { useEffect, useState } from "react";
import { StyleSheet, BackHandler, View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { addPlayerListener, dismissPlayer, presentPlayer } from "@/modules/av-player-view";
import useDetailStore from "@/stores/detailStore";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import { stopActivePlayback } from "@/utils/playbackGuard";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("PlayScreen");

/**
 * 播放页：以全屏模态呈现原生 AVPlayerViewController（只有全屏形态才带完整传输条按钮）。
 * 界面、进度条、快进快退、播放暂停全部由 tvOS 原生播放器提供；
 * RN 侧只负责取片源地址、回传进度、原生播放器关闭后回到详情页。
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
  const [hasPresented, setHasPresented] = useState(false);
  const leavingRef = React.useRef(false);

  // 载入片源
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

  // 片源就绪后，全屏呈现原生播放器
  useEffect(() => {
    const url = currentEpisode?.url;
    if (!url || hasPresented) return;
    setHasPresented(true);
    presentPlayer(url, initialPosition || 0);
    // initialPosition 只在首次呈现时用一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpisode?.url, hasPresented]);

  // 进度回传 → store（续播与播放记录）
  useEffect(() => {
    const sub = addPlayerListener("onProgress", (payload: any) => {
      const positionMillis = payload?.positionMillis ?? 0;
      const durationMillis = payload?.durationMillis ?? 0;
      if (!durationMillis) return;
      handlePlaybackStatusUpdate({
        isLoaded: true,
        positionMillis,
        durationMillis,
        isPlaying: !!payload?.isPlaying,
        didJustFinish: false,
        isBuffering: false,
        playbackRate: 1.0,
        shouldPlay: !!payload?.isPlaying,
      } as any);
    });
    return () => sub.remove();
  }, [handlePlaybackStatusUpdate]);

  // 原生播放器被系统关闭（遥控 Menu 退出）→ 记录位置并回详情页
  useEffect(() => {
    const leave = () => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      try {
        usePlayerStore.getState()._savePlayRecord(undefined, { immediate: true });
      } catch {
        // 忽略
      }
      stopActivePlayback().catch(() => {});
      router.back();
    };

    const sub = addPlayerListener("onDismiss", leave);
    return () => sub.remove();
  }, [router]);

  // RN 侧返回兜底
  useEffect(() => {
    let lastBackAt = 0;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const now = Date.now();
      if (now - lastBackAt < 400) return true;
      lastBackAt = now;
      dismissPlayer();
      try {
        usePlayerStore.getState()._savePlayRecord(undefined, { immediate: true });
      } catch {
        // 忽略
      }
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router]);

  // 页面卸载时确保原生播放器被关掉
  useEffect(() => {
    return () => {
      dismissPlayer();
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#333333" size="large" />
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
});
