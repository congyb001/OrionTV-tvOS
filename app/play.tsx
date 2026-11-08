import React, { useEffect, useRef, useCallback, memo, useMemo, useState } from "react";
import { StyleSheet, Pressable, BackHandler, AppState, AppStateStatus, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import { ThemedView } from "@/components/ThemedView";
import { PlayerControls } from "@/components/PlayerControls";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import { SourceSelectionModal } from "@/components/SourceSelectionModal";
import { SpeedSelectionModal } from "@/components/SpeedSelectionModal";
import { SeekingBar } from "@/components/SeekingBar";
// import { NextEpisodeOverlay } from "@/components/NextEpisodeOverlay";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import useDetailStore from "@/stores/detailStore";
import { useTVRemoteHandler } from "@/hooks/useTVRemoteHandler";
import Toast from "react-native-toast-message";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVideoHandlers } from "@/hooks/useVideoHandlers";
import { releasePlayback, stopActivePlayback } from "@/utils/playbackGuard";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('PlayScreen');

// 优化的加载动画组件
const LoadingContainer = memo(
  ({ style, currentEpisode }: { style: any; currentEpisode: { url: string; title: string } | undefined }) => {
    logger.info(
      `[PERF] Video component NOT rendered - waiting for valid URL. currentEpisode: ${!!currentEpisode}, url: ${
        currentEpisode?.url ? "exists" : "missing"
      }`
    );
    return (
      <View style={style}>
        <VideoLoadingAnimation showProgressBar />
      </View>
    );
  }
);

LoadingContainer.displayName = "LoadingContainer";

// 移到组件外部避免重复创建
const createResponsiveStyles = (deviceType: string) => {
  const isMobile = deviceType === "mobile";
  const isTablet = deviceType === "tablet";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "black",
      // 移动端和平板端可能需要状态栏处理
      ...(isMobile || isTablet ? { paddingTop: 0 } : {}),
    },
    videoContainer: {
      ...StyleSheet.absoluteFillObject,
      // 为触摸设备添加更多的交互区域
      ...(isMobile || isTablet ? { zIndex: 1 } : {}),
    },
    videoPlayer: {
      ...StyleSheet.absoluteFillObject,
    },
    loadingContainer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
  });
};

export default function PlayScreen() {
  const videoRef = useRef<Video>(null);
  const [isExiting, setIsExiting] = useState(false);
  // 播放意图：undefined 时按「有断点就先不播」的默认处理，首帧定位完成后置为 true。
  // 之后即使任何 prop 重新下发，也不会把用户手动暂停的状态冲掉。
  const [shouldPlayOverride, setShouldPlayOverride] = useState<boolean | undefined>(undefined);
  const wasPlayingBeforeBackground = useRef(false);
  const router = useRouter();
  useKeepAwake();

  // 响应式布局配置
  const { deviceType } = useResponsiveLayout();

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
  const id = videoId || detail?.id.toString();
  const title = videoTitle || detail?.title;
  const {
    isLoading,
    showControls,
    // showNextEpisodeOverlay,
    initialPosition,
    introEndTime,
    playbackRate,
    setVideoRef,
    handlePlaybackStatusUpdate,
    setShowControls,
    // setShowNextEpisodeOverlay,
    reset,
    loadVideo,
  } = usePlayerStore();
  const currentEpisode = usePlayerStore(selectCurrentEpisode);

  // 使用Video事件处理hook
  const { videoProps } = useVideoHandlers({
    videoRef,
    currentEpisode,
    initialPosition,
    introEndTime,
    playbackRate,
    handlePlaybackStatusUpdate,
    deviceType,
    detail: detail || undefined,
    shouldPlayOverride,
    onReady: () => setShouldPlayOverride(true),
  });

  // TV遥控器处理 - 总是调用hook，但根据设备类型决定是否使用结果
  const tvRemoteHandler = useTVRemoteHandler();

  // 优化的动态样式 - 使用useMemo避免重复计算
  const dynamicStyles = useMemo(() => createResponsiveStyles(deviceType), [deviceType]);

  useEffect(() => {
    const perfStart = performance.now();
    logger.info(`[PERF] PlayScreen useEffect START - source: ${source}, id: ${id}, title: ${title}`);

    setVideoRef(videoRef);
    // 进入播放页无条件先停掉上一路播放器（此时 ref 还没挂载，不能依赖 ref）
    stopActivePlayback().catch(() => {});
    if (source && id && title) {
      logger.info(`[PERF] Calling loadVideo with episodeIndex: ${episodeIndex}, position: ${position}`);
      loadVideo({ source, id, episodeIndex, position, title });
    } else {
      logger.info(`[PERF] Missing required params - source: ${!!source}, id: ${!!id}, title: ${!!title}`);
    }

    const perfEnd = performance.now();
    logger.info(`[PERF] PlayScreen useEffect END - took ${(perfEnd - perfStart).toFixed(2)}ms`);

    return () => {
      logger.info(`[PERF] PlayScreen unmounting - pause & unload video`);
      // 必须显式停掉播放器：否则 tvOS 上旧播放器可能继续出声，与新播放器叠加成"两个声音"
      releasePlayback(videoRef.current as any).catch(() => {});
    };
  }, [episodeIndex, source, position, setVideoRef, loadVideo, id, title]);

  // 仅在真正卸载时清理播放状态，避免参数变化时把 detail 清空、闪出加载页
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // 优化的屏幕点击处理
  const onScreenPress = useCallback(() => {
    if (deviceType === "tv") {
      tvRemoteHandler.onScreenPress();
    } else {
      setShowControls(!showControls);
    }
  }, [deviceType, tvRemoteHandler, setShowControls, showControls]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        // 记下切后台前是否在播，回前台后恢复（暂停状态则保持暂停）
        const st: any = usePlayerStore.getState().status;
        wasPlayingBeforeBackground.current = !!st?.isPlaying;
        videoRef.current?.pauseAsync?.();
      } else if (nextAppState === "active") {
        if (wasPlayingBeforeBackground.current) {
          videoRef.current?.playAsync?.().catch(() => {});
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let lastBackAt = 0;
    const backAction = () => {
      // tvOS 的菜单键可能连发两次事件，去重，避免一次返回连退两屏
      const now = Date.now();
      if (now - lastBackAt < 400) return true;
      lastBackAt = now;

      const state = usePlayerStore.getState();

      // 有弹窗时先关弹窗，别把整个播放页退掉
      if (state.showEpisodeModal) {
        state.setShowEpisodeModal(false);
        return true;
      }
      if (state.showSourceModal) {
        state.setShowSourceModal(false);
        return true;
      }
      if (state.showSpeedModal) {
        state.setShowSpeedModal(false);
        return true;
      }

      // 退出前先落一次播放记录（续播位置才不会丢）
      try {
        state._savePlayRecord(undefined, { immediate: true });
      } catch {
        // 记录失败不影响退出
      }

      // 一次返回就直接离开播放页：先停播（不留音轨），再退出。
      setIsExiting(true);
      stopActivePlayback().catch(() => {});
      router.back();
      return true;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);

    return () => backHandler.remove();
  }, [router]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    if (isLoading) {
      timeoutId = setTimeout(() => {
        if (usePlayerStore.getState().isLoading) {
          usePlayerStore.setState({ isLoading: false });
          Toast.show({ type: "error", text1: "播放超时，请重试" });
        }
      }, 60000); // 1 minute
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isLoading]);

  if (!detail) {
    // 退出过程中 detail 可能已被清空：给纯黑底，不要闪"正在加载视频"
    if (isExiting) {
      return <ThemedView style={dynamicStyles.container} />;
    }
    // 首次进入、详情还在初始化：正常显示加载
    return <VideoLoadingAnimation showProgressBar />;
  }

  return (
    <ThemedView style={dynamicStyles.container}>
      {/* 视频层：不可聚焦，避免抢走遥控焦点 */}
      <View style={dynamicStyles.videoContainer}>
        {currentEpisode?.url ? (
          <Video
            ref={videoRef}
            style={dynamicStyles.videoPlayer}
            {...videoProps}
          />
        ) : (
          <LoadingContainer style={dynamicStyles.loadingContainer} currentEpisode={currentEpisode} />
        )}
      </View>

      {/* 触摸设备：点屏幕切换控制条 */}
      {deviceType !== "tv" && (
        <Pressable
          focusable={false}
          style={dynamicStyles.videoContainer}
          onPress={onScreenPress}
        />
      )}

      {/* 控件作为独立层渲染，每个按钮都独立可获得焦点 */}
      {showControls && deviceType === "tv" && (
        <PlayerControls showControls={showControls} setShowControls={setShowControls} />
      )}

      <SeekingBar />

      {currentEpisode?.url && isLoading && !isExiting && (
        <View style={dynamicStyles.loadingContainer}>
          <VideoLoadingAnimation showProgressBar />
        </View>
      )}

      <EpisodeSelectionModal />
      <SourceSelectionModal />
      <SpeedSelectionModal />
    </ThemedView>
  );
}
