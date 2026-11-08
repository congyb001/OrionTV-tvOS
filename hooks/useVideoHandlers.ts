import { useCallback, RefObject, useMemo } from 'react';
import { Video, ResizeMode } from 'expo-av';
import Toast from 'react-native-toast-message';
import usePlayerStore from '@/stores/playerStore';
import { claimPlayback } from '@/utils/playbackGuard';

interface UseVideoHandlersProps {
  videoRef: RefObject<Video>;
  currentEpisode: { url: string; title: string } | undefined;
  initialPosition: number;
  introEndTime?: number;
  playbackRate: number;
  handlePlaybackStatusUpdate: (status: any) => void;
  deviceType: string;
  detail?: { poster?: string };
  /** 外部控制的播放意图；undefined 表示按默认（有断点位置就先不播） */
  shouldPlayOverride?: boolean;
  /** 首帧定位完成后回调 */
  onReady?: () => void;
}

export const useVideoHandlers = ({
  videoRef,
  currentEpisode,
  initialPosition,
  introEndTime,
  playbackRate,
  handlePlaybackStatusUpdate,
  deviceType,
  detail,
  shouldPlayOverride,
  onReady,
}: UseVideoHandlersProps) => {
  
  const onLoad = useCallback(async () => {
    console.info(`[PERF] Video onLoad - video ready to play`);
    
    try {
      // 0. 先把这一路暂停住，确保后面「定位 → 播放」不会和上一路残留的消息重叠
      await videoRef.current?.pauseAsync?.();

      // 1. 定位到断点位置；换集时 initialPosition 为 0，这里也显式复位，
      //    否则某些 HLS 源换片后会沿用上一集的时间轴，出现"切集不从片头开始"
      const jumpPosition = initialPosition || 0;
      console.info(`[PERF] Setting initial position to ${jumpPosition}ms`);
      await videoRef.current?.setPositionAsync(jumpPosition);
      
      // 2. 显式调用播放以确保自动播放
      console.info(`[AUTOPLAY] Attempting to start playback after onLoad`);
      await videoRef.current?.playAsync();
      console.info(`[AUTOPLAY] Auto-play successful after onLoad`);
      onReady?.();
      
      usePlayerStore.setState({ isLoading: false });
      console.info(`[PERF] Video loading complete - isLoading set to false`);
    } catch (error) {
      console.warn(`[AUTOPLAY] Failed to auto-play after onLoad:`, error);
      // 即使自动播放失败，也要设置加载完成状态
      usePlayerStore.setState({ isLoading: false });
      // 不显示错误提示，因为自动播放失败是常见且预期的情况
    }
  }, [videoRef, initialPosition, introEndTime, onReady]);

  const onLoadStart = useCallback(() => {
    if (!currentEpisode?.url) return;

    // 新源开始加载时抢占音频，把可能残留的旧播放器停掉
    claimPlayback(videoRef.current as any).catch(() => {});
    
    console.info(`[PERF] Video onLoadStart - starting to load video: ${currentEpisode.url.substring(0, 100)}...`);
    usePlayerStore.setState({ isLoading: true });
  }, [currentEpisode?.url, videoRef]);

  const onError = useCallback((error: any) => {
    if (!currentEpisode?.url) return;
    
    console.error(`[ERROR] Video playback error:`, error);
    
    // 检测SSL证书错误和其他网络错误
    const errorString = (error as any)?.error?.toString() || error?.toString() || '';
    const isSSLError = errorString.includes('SSLHandshakeException') || 
                      errorString.includes('CertPathValidatorException') ||
                      errorString.includes('Trust anchor for certification path not found');
    const isNetworkError = errorString.includes('HttpDataSourceException') ||
                         errorString.includes('IOException') ||
                         errorString.includes('SocketTimeoutException');
    
    if (isSSLError) {
      console.error(`[SSL_ERROR] SSL certificate validation failed for URL: ${currentEpisode.url}`);
      Toast.show({ 
        type: "error", 
        text1: "SSL证书错误，正在尝试其他播放源...",
        text2: "请稍候"
      });
      usePlayerStore.getState().handleVideoError('ssl', currentEpisode.url);
    } else if (isNetworkError) {
      console.error(`[NETWORK_ERROR] Network connection failed for URL: ${currentEpisode.url}`);
      Toast.show({ 
        type: "error", 
        text1: "网络连接失败，正在尝试其他播放源...",
        text2: "请稍候"
      });
      usePlayerStore.getState().handleVideoError('network', currentEpisode.url);
    } else {
      console.error(`[VIDEO_ERROR] Other video error for URL: ${currentEpisode.url}`);
      Toast.show({ 
        type: "error", 
        text1: "视频播放失败，正在尝试其他播放源...",
        text2: "请稍候"
      });
      usePlayerStore.getState().handleVideoError('other', currentEpisode.url);
    }
  }, [currentEpisode?.url]);

  // 优化的Video组件props
  const videoProps = useMemo(() => ({
    source: { uri: currentEpisode?.url || '' },
    posterSource: { uri: detail?.poster ?? "" },
    resizeMode: ResizeMode.CONTAIN,
    rate: playbackRate,
    onPlaybackStatusUpdate: handlePlaybackStatusUpdate,
    onLoad,
    onLoadStart,
    onError,
    useNativeControls: deviceType !== 'tv',
    // 断点续播时不要"先从头播再跳"：先不播，等 onLoad 里定位到记录位置后再显式播放，
    // 否则 tvOS 上从头的那段音频会和跳转后的一段叠在一起（听起来就是两个声音）
    shouldPlay: shouldPlayOverride ?? !(initialPosition && initialPosition > 0),
  }), [
    shouldPlayOverride,
    initialPosition,
    currentEpisode?.url,
    detail?.poster,
    playbackRate,
    handlePlaybackStatusUpdate,
    onLoad,
    onLoadStart,
    onError,
    deviceType,
  ]);

  return {
    onLoad,
    onLoadStart,
    onError,
    videoProps,
  };
};