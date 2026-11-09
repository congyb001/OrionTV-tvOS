import { create } from "zustand";
import Toast from "react-native-toast-message";
import { AVPlaybackStatus, Video } from "expo-av";
import { RefObject } from "react";
import { PlayRecord, PlayRecordManager, PlayerSettingsManager } from "@/services/storage";
import useDetailStore, { episodesSelectorBySource } from "./detailStore";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('PlayerStore');

/**
 * 确保播放器处于播放状态。
 * tvOS 的 HLS 在 pause → setPosition 之后，单次 playAsync 有时不生效（seek 尚未落地
 * 或播放意图被覆盖），这里轮询几次确认，避免出现"跳完停在暂停帧"。
 */
let seekHudTimer: ReturnType<typeof setTimeout> | null = null;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let sleepCountdownTimer: ReturnType<typeof setInterval> | null = null;

async function ensurePlaying(video: any, attempts = 4): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const st: any = await video?.getStatusAsync?.();
      if (st?.isLoaded && st.isPlaying) return true;
      await video?.playAsync?.();
    } catch (err) {
      logger.debug("ensurePlaying attempt failed:", err);
    }
    await new Promise((r) => setTimeout(r, 180));
  }
  try {
    const st: any = await video?.getStatusAsync?.();
    return !!(st?.isLoaded && st.isPlaying);
  } catch {
    return false;
  }
}

interface Episode {
  url: string;
  title: string;
}

interface PlayerState {
  videoRef: RefObject<Video> | null;
  currentEpisodeIndex: number;
  episodes: Episode[];
  status: AVPlaybackStatus | null;
  isLoading: boolean;
  showControls: boolean;
  showEpisodeModal: boolean;
  showSourceModal: boolean;
  showSpeedModal: boolean;
  showNextEpisodeOverlay: boolean;
  isSeeking: boolean;
  seekPosition: number;
  progressPosition: number;
  initialPosition: number;
  playbackRate: number;
  introEndTime?: number;
  outroStartTime?: number;
  recapEndTime?: number;
  /** 用户是否主动按了暂停（快进/跳过之后据此决定是否自动续播） */
  userPaused: boolean;
  /** 快进/快退时的大号提示层（Infuse 风格） */
  seekHudVisible: boolean;
  seekHudDelta: number;
  showSeekHud: (delta: number) => void;
  /** 右侧面板：信息 / 设置 / 睡眠 / 音频 / 音乐 */
  activePanel: "info" | "settings" | "sleep" | "audio" | "music" | "cast" | null;
  /** 连续播放：本集播完自动下一集 */
  autoPlayNext: boolean;
  /** 4:3 覆盖层：强制以 4:3 比例显示 */
  cover43: boolean;
  /** 自动跳过片头（识别到片头区间时自动跳） */
  autoSkipIntro: boolean;
  /** 跳过片头提示：是否显示跳过按钮 */
  skipIntroHint: boolean;
  /** 睡眠倒计时剩余毫秒（null 表示未开启） */
  sleepRemainingMs: number | null;
  /** 睡眠定时：播完本片后暂停 */
  sleepUntilEnd: boolean;
  setActivePanel: (panel: "info" | "settings" | "sleep" | "audio" | "music" | "cast" | null) => void;
  /** 已经自动跳过片头的集索引，避免反复跳 */
  _autoSkippedAt?: number;
  setAutoPlayNext: (v: boolean) => void;
  setCover43: (v: boolean) => void;
  setAutoSkipIntro: (v: boolean) => void;
  setSkipIntroHint: (v: boolean) => void;
  startSleepTimer: (minutes: number | "end") => void;
  resetSleepTimer: () => void;
  showMarkersModal: boolean;
  setVideoRef: (ref: RefObject<Video>) => void;
  loadVideo: (options: {
    source: string;
    id: string;
    title: string;
    episodeIndex: number;
    position?: number;
  }) => Promise<void>;
  playEpisode: (index: number) => void;
  togglePlayPause: () => void;
  seek: (duration: number) => void;
  handlePlaybackStatusUpdate: (newStatus: AVPlaybackStatus) => void;
  setLoading: (loading: boolean) => void;
  setShowControls: (show: boolean) => void;
  setShowEpisodeModal: (show: boolean) => void;
  setShowSourceModal: (show: boolean) => void;
  setShowSpeedModal: (show: boolean) => void;
  setShowNextEpisodeOverlay: (show: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setIntroEndTime: () => void;
  setOutroStartTime: () => void;
  setRecapEndTime: () => void;
  setMarkerAtCurrentPosition: (kind: "recap" | "intro" | "outro") => void;
  clearMarker: (kind: "recap" | "intro" | "outro") => void;
  setShowMarkersModal: (show: boolean) => void;
  /** 跳到绝对位置（毫秒），先暂停再跳，避免边播边跳留下旧缓冲 */
  skipTo: (positionMillis: number) => Promise<void>;
  reset: () => void;
  _seekTimeout?: NodeJS.Timeout;
  _isRecordSaveThrottled: boolean;
  // Internal helper
  _savePlayRecord: (updates?: Partial<PlayRecord>, options?: { immediate?: boolean }) => void;
  handleVideoError: (errorType: 'ssl' | 'network' | 'other', failedUrl: string) => Promise<void>;
}

const usePlayerStore = create<PlayerState>((set, get) => ({
  videoRef: null,
  episodes: [],
  currentEpisodeIndex: -1,
  status: null,
  isLoading: true,
  showControls: false,
  showEpisodeModal: false,
  showSourceModal: false,
  showSpeedModal: false,
  showNextEpisodeOverlay: false,
  isSeeking: false,
  seekPosition: 0,
  progressPosition: 0,
  initialPosition: 0,
  playbackRate: 1.0,
  introEndTime: undefined,
  outroStartTime: undefined,
  recapEndTime: undefined,
  userPaused: false,
  seekHudVisible: false,
  seekHudDelta: 0,
  activePanel: null,
  autoPlayNext: true,
  cover43: false,
  autoSkipIntro: false,
  skipIntroHint: true,
  sleepRemainingMs: null,
  sleepUntilEnd: false,
  _autoSkippedAt: undefined,
  showMarkersModal: false,
  _seekTimeout: undefined,
  _isRecordSaveThrottled: false,

  setVideoRef: (ref) => set({ videoRef: ref }),

  loadVideo: async ({ source, id, episodeIndex, position, title }) => {
    const perfStart = performance.now();
    logger.info(`[PERF] PlayerStore.loadVideo START - source: ${source}, id: ${id}, title: ${title}`);
    
    let detail = useDetailStore.getState().detail;
    let episodes: string[] = [];
    
    // 如果有detail，使用detail的source获取episodes；否则使用传入的source
    if (detail && detail.source) {
      logger.info(`[INFO] Using existing detail source "${detail.source}" to get episodes`);
      episodes = episodesSelectorBySource(detail.source)(useDetailStore.getState());
    } else {
      logger.info(`[INFO] No existing detail, using provided source "${source}" to get episodes`);
      episodes = episodesSelectorBySource(source)(useDetailStore.getState());
    }

    set({
      isLoading: true,
    });

    const needsDetailInit = !detail || !episodes || episodes.length === 0 || detail.title !== title;
    logger.info(`[PERF] Detail check - needsInit: ${needsDetailInit}, hasDetail: ${!!detail}, episodesCount: ${episodes?.length || 0}`);

    if (needsDetailInit) {
      const detailInitStart = performance.now();
      logger.info(`[PERF] DetailStore.init START - ${title}`);
      
      await useDetailStore.getState().init(title, source, id);
      
      const detailInitEnd = performance.now();
      logger.info(`[PERF] DetailStore.init END - took ${(detailInitEnd - detailInitStart).toFixed(2)}ms`);
      
      detail = useDetailStore.getState().detail;
      
      if (!detail) {
        logger.error(`[ERROR] Detail not found after initialization for "${title}" (source: ${source}, id: ${id})`);
        
        // 检查DetailStore的错误状态
        const detailStoreState = useDetailStore.getState();
        if (detailStoreState.error) {
          logger.error(`[ERROR] DetailStore error: ${detailStoreState.error}`);
          set({ 
            isLoading: false,
            // 可以选择在这里设置一个错误状态，但playerStore可能没有error字段
          });
        } else {
          logger.error(`[ERROR] DetailStore init completed but no detail found and no error reported`);
          set({ isLoading: false });
        }
        return;
      }
      
      // 使用DetailStore找到的实际source来获取episodes，而不是原始的preferredSource
      logger.info(`[INFO] Using actual source "${detail.source}" instead of preferred source "${source}"`);  
      episodes = episodesSelectorBySource(detail.source)(useDetailStore.getState());
      
      if (!episodes || episodes.length === 0) {
        logger.error(`[ERROR] No episodes found for "${title}" from source "${detail.source}" (${detail.source_name})`);
        
        // 尝试从searchResults中直接获取episodes
        const detailStoreState = useDetailStore.getState();
        logger.info(`[INFO] Available sources in searchResults: ${detailStoreState.searchResults.map(r => `${r.source}(${r.episodes?.length || 0} episodes)`).join(', ')}`);
        
        // 如果当前source没有episodes，尝试使用第一个有episodes的source
        const sourceWithEpisodes = detailStoreState.searchResults.find(r => r.episodes && r.episodes.length > 0);
        if (sourceWithEpisodes) {
          logger.info(`[FALLBACK] Using alternative source "${sourceWithEpisodes.source}" with ${sourceWithEpisodes.episodes.length} episodes`);
          episodes = sourceWithEpisodes.episodes;
          // 更新detail为有episodes的source
          detail = sourceWithEpisodes;
        } else {
          logger.error(`[ERROR] No source with episodes found in searchResults`);
          set({ isLoading: false });
          return;
        }
      }
      
      logger.info(`[SUCCESS] Detail and episodes loaded - source: ${detail.source_name}, episodes: ${episodes.length}`);
    } else {
      logger.info(`[PERF] Skipping DetailStore.init - using cached data`);
      
      // 即使是缓存的数据，也要确保使用正确的source获取episodes
      if (detail && detail.source && detail.source !== source) {
        logger.info(`[INFO] Cached detail source "${detail.source}" differs from provided source "${source}", updating episodes`);
        episodes = episodesSelectorBySource(detail.source)(useDetailStore.getState());
        
        if (!episodes || episodes.length === 0) {
          logger.warn(`[WARN] Cached detail source "${detail.source}" has no episodes, trying provided source "${source}"`);
          episodes = episodesSelectorBySource(source)(useDetailStore.getState());
        }
      }
    }

    // 最终验证：确保我们有有效的detail和episodes数据
    if (!detail) {
      logger.error(`[ERROR] Final check failed: detail is null`);
      set({ isLoading: false });
      return;
    }
    
    if (!episodes || episodes.length === 0) {
      logger.error(`[ERROR] Final check failed: no episodes available for source "${detail.source}" (${detail.source_name})`);
      set({ isLoading: false });
      return;
    }
    
    logger.info(`[SUCCESS] Final validation passed - detail: ${detail.source_name}, episodes: ${episodes.length}`);

    try {
      const storageStart = performance.now();
      logger.info(`[PERF] Storage operations START`);
      
      const playRecord = await PlayRecordManager.get(detail!.source, detail!.id.toString());
      const storagePlayRecordEnd = performance.now();
      logger.info(`[PERF] PlayRecordManager.get took ${(storagePlayRecordEnd - storageStart).toFixed(2)}ms`);
      
      const playerSettings = await PlayerSettingsManager.get(detail!.source, detail!.id.toString());
      const storageEnd = performance.now();
      logger.info(`[PERF] PlayerSettingsManager.get took ${(storageEnd - storagePlayRecordEnd).toFixed(2)}ms`);
      logger.info(`[PERF] Total storage operations took ${(storageEnd - storageStart).toFixed(2)}ms`);
      
      const initialPositionFromRecord = playRecord?.play_time ? playRecord.play_time * 1000 : 0;
      const savedPlaybackRate = playerSettings?.playbackRate || 1.0;
      
      const episodesMappingStart = performance.now();
      const mappedEpisodes = episodes.map((ep, index) => ({
        url: ep,
        title: `第 ${index + 1} 集`,
      }));
      const episodesMappingEnd = performance.now();
      logger.info(`[PERF] Episodes mapping (${episodes.length} episodes) took ${(episodesMappingEnd - episodesMappingStart).toFixed(2)}ms`);
      
      set({
        isLoading: false,
        currentEpisodeIndex: episodeIndex,
        initialPosition: position || initialPositionFromRecord,
        playbackRate: savedPlaybackRate,
        episodes: mappedEpisodes,
        introEndTime: playRecord?.introEndTime || playerSettings?.introEndTime,
        outroStartTime: playRecord?.outroStartTime || playerSettings?.outroStartTime,
        recapEndTime: playRecord?.recapEndTime || playerSettings?.recapEndTime,
      });
      
      const perfEnd = performance.now();
      logger.info(`[PERF] PlayerStore.loadVideo COMPLETE - total time: ${(perfEnd - perfStart).toFixed(2)}ms`);
      
    } catch (error) {
      logger.debug("Failed to load play record", error);
      set({ isLoading: false });
      
      const perfEnd = performance.now();
      logger.info(`[PERF] PlayerStore.loadVideo ERROR - total time: ${(perfEnd - perfStart).toFixed(2)}ms`);
    }
  },

  playEpisode: async (index) => {
    const { episodes, videoRef } = get();
    if (index >= 0 && index < episodes.length) {
      set({
        currentEpisodeIndex: index,
        showNextEpisodeOverlay: false,
        initialPosition: 0,
        progressPosition: 0,
        seekPosition: 0,
      });
      // 换集必须从头播：有些 HLS 源换片后位置会延续上一集的时间轴，
      // 这里显式把位置打回 0；如果此刻还没加载完，onLoad 里会再补一次。
      set({ userPaused: false, _autoSkippedAt: undefined });
      try {
        await videoRef?.current?.setPositionAsync(0);
        await ensurePlaying(videoRef?.current as any);
      } catch {
        // 尚未加载完成时忽略，由 onLoad 兜底
      }
      // 切集时不再用 replayAsync：源已随 index 变化，Video 会带着新源重新挂载并自动播放。
      // 旧实现里 replayAsync 会在新源加载时再起一个播放器，造成两个声音重叠。
      logger.info(`[PLAYER] Stock switched to episode index ${index}`);
    }
  },

  togglePlayPause: async () => {
    const video = get().videoRef?.current;
    if (!video) return;

    try {
      // 用播放器的实时状态判断，store 里的 status 可能滞后一两个心跳
      const fresh: any = await video.getStatusAsync();
      if (!fresh?.isLoaded) return;

      if (fresh.isPlaying) {
        set({ userPaused: true });
        await video.pauseAsync();
      } else {
        set({ userPaused: false });
        await ensurePlaying(video);
      }
    } catch (error) {
      logger.debug("Failed to toggle play/pause:", error);
      Toast.show({ type: "error", text1: "操作失败" });
    }
  },

  seek: async (duration) => {
    const { videoRef } = get();
    const video = videoRef?.current;
    if (!video) return;

    // 用播放器实时状态算目标位置，避免 store 里缓存的位置过期导致越界跳转
    let fresh: any = null;
    try {
      fresh = await video.getStatusAsync();
    } catch {
      return;
    }
    if (!fresh?.isLoaded || !fresh.durationMillis) return;

    const currentPos = Math.max(fresh.positionMillis || 0, 0);
    const target = Math.max(0, Math.min(currentPos + duration, fresh.durationMillis - 1000));
    // 是否自动续播以"用户有没有主动暂停"为准，不依赖某一帧的 isPlaying 快照
    const shouldResume = !get().userPaused;

    const doSeek = async () => {
      // 关键：跳转前先暂停、落地后再恢复播放。
      // 边播边跳在 tvOS 的 HLS 上会保留旧的一段缓冲继续出声，听感就是"两个声音"。
      await video.pauseAsync?.();
      await video.setPositionAsync(target);
      await new Promise((r) => setTimeout(r, 250));
      // 跳完必须真的在播，否则会出现"快进后停在暂停画面，要按播放键才动"
      if (shouldResume) await ensurePlaying(video);
    };

    try {
      await doSeek();
    } catch (error) {
      logger.debug("Failed to seek video, retrying:", error);
      try {
        await doSeek();
      } catch (err) {
        logger.debug("Failed to seek video:", err);
        Toast.show({ type: "error", text1: "快进/快退失败" });
      }
    }

    set({
      isSeeking: true,
      seekPosition: target / fresh.durationMillis,
    });
    get().showSeekHud(duration);

    if (get()._seekTimeout) {
      clearTimeout(get()._seekTimeout);
    }
    const timeoutId = setTimeout(() => set({ isSeeking: false }), 1000);
    set({ _seekTimeout: timeoutId });
  },

  setIntroEndTime: () => {
    const { status, introEndTime: existingIntroEndTime } = get();
    const detail = useDetailStore.getState().detail;
    if (!status?.isLoaded || !detail) return;

    if (existingIntroEndTime) {
      // Clear the time
      set({ introEndTime: undefined });
      get()._savePlayRecord({ introEndTime: undefined }, { immediate: true });
      Toast.show({
        type: "info",
        text1: "已清除片头时间",
      });
    } else {
      // Set the time
      const newIntroEndTime = status.positionMillis;
      set({ introEndTime: newIntroEndTime });
      get()._savePlayRecord({ introEndTime: newIntroEndTime }, { immediate: true });
      Toast.show({
        type: "success",
        text1: "设置成功",
        text2: "片头时间已记录。",
      });
    }
  },

  setOutroStartTime: () => {
    const { status, outroStartTime: existingOutroStartTime } = get();
    const detail = useDetailStore.getState().detail;
    if (!status?.isLoaded || !detail) return;

    if (existingOutroStartTime) {
      // Clear the time
      set({ outroStartTime: undefined });
      get()._savePlayRecord({ outroStartTime: undefined }, { immediate: true });
      Toast.show({
        type: "info",
        text1: "已清除片尾时间",
      });
    } else {
      // Set the time
      if (!status.durationMillis) return;
      const newOutroStartTime = status.durationMillis - status.positionMillis;
      set({ outroStartTime: newOutroStartTime });
      get()._savePlayRecord({ outroStartTime: newOutroStartTime }, { immediate: true });
      Toast.show({
        type: "success",
        text1: "设置成功",
        text2: "片尾时间已记录。",
      });
    }
  },

  setRecapEndTime: () => {
    get().setMarkerAtCurrentPosition("recap");
  },

  setActivePanel: (panel) => set({ activePanel: panel }),
  setAutoPlayNext: (v) => set({ autoPlayNext: v }),
  setCover43: (v) => set({ cover43: v }),
  setAutoSkipIntro: (v) => set({ autoSkipIntro: v }),
  setSkipIntroHint: (v) => set({ skipIntroHint: v }),

  startSleepTimer: (minutes) => {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    if (sleepCountdownTimer) {
      clearInterval(sleepCountdownTimer);
      sleepCountdownTimer = null;
    }

    if (minutes === "end") {
      set({ sleepUntilEnd: true, sleepRemainingMs: null });
      Toast.show({ type: "info", text1: "睡眠定时", text2: "本片播放结束后暂停" });
      return;
    }

    const totalMs = minutes * 60 * 1000;
    const deadline = Date.now() + totalMs;
    set({ sleepUntilEnd: false, sleepRemainingMs: totalMs });

    sleepCountdownTimer = setInterval(() => {
      const left = deadline - Date.now();
      if (left <= 0) return;
      set({ sleepRemainingMs: left });
    }, 1000) as any;

    sleepTimer = setTimeout(async () => {
      try {
        await get().videoRef?.current?.pauseAsync();
        set({ userPaused: true });
      } catch {}
      if (sleepCountdownTimer) {
        clearInterval(sleepCountdownTimer);
        sleepCountdownTimer = null;
      }
      set({ sleepRemainingMs: null, sleepUntilEnd: false });
      Toast.show({ type: "info", text1: "睡眠定时", text2: `${minutes} 分钟已到，已暂停播放` });
    }, totalMs) as any;

    Toast.show({ type: "success", text1: "睡眠定时", text2: `${minutes} 分钟后暂停` });
  },

  resetSleepTimer: () => {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    if (sleepCountdownTimer) {
      clearInterval(sleepCountdownTimer);
      sleepCountdownTimer = null;
    }
    set({ sleepRemainingMs: null, sleepUntilEnd: false });
  },

  showSeekHud: (delta) => {
    if (seekHudTimer) clearTimeout(seekHudTimer);
    set({ seekHudVisible: true, seekHudDelta: delta });
    seekHudTimer = setTimeout(() => set({ seekHudVisible: false }), 1500);
  },

  setShowMarkersModal: (show) => set({ showMarkersModal: show }),

  setMarkerAtCurrentPosition: (kind) => {
    const { status } = get();
    if (!status?.isLoaded) return;

    const position = Math.floor(status.positionMillis || 0);
    const duration = status.durationMillis || 0;

    const patch: any = {};
    if (kind === "recap") {
      patch.recapEndTime = position;
    } else if (kind === "intro") {
      patch.introEndTime = position;
    } else {
      if (!duration) return;
      // 片尾标记存的是"距离结尾还有多久"，与旧逻辑保持一致
      patch.outroStartTime = Math.max(1000, duration - position);
    }

    set(patch);
    get()._savePlayRecord(patch, { immediate: true });
    Toast.show({ type: "success", text1: "已记录当前位置" });
  },

  clearMarker: (kind) => {
    const detail = useDetailStore.getState().detail;
    const patch: any =
      kind === "recap"
        ? { recapEndTime: undefined }
        : kind === "intro"
          ? { introEndTime: undefined }
          : { outroStartTime: undefined };

    set(patch);
    get()._savePlayRecord(patch, { immediate: true });
    if (detail) {
      PlayerSettingsManager.save(detail.source, detail.id.toString(), patch).catch(() => {});
    }
    Toast.show({ type: "info", text1: "已清除该标记" });
  },

  skipTo: async (positionMillis) => {
    const { videoRef } = get();
    const video = videoRef?.current;
    if (!video) return;

    let fresh: any = null;
    try {
      fresh = await video.getStatusAsync();
    } catch {
      return;
    }
    if (!fresh?.isLoaded) return;

    const target = Math.max(0, Math.min(positionMillis, (fresh.durationMillis || positionMillis) - 500));
    const shouldResume = !get().userPaused;

    try {
      await video.pauseAsync?.();
      await video.setPositionAsync(target);
      await new Promise((r) => setTimeout(r, 200));
      // 跳过片头/回顾后要自动继续播，别停在那一帧
      if (shouldResume) await ensurePlaying(video);
    } catch (err) {
      logger.debug("Failed to skip:", err);
    }

    set({ isSeeking: false, progressPosition: fresh.durationMillis ? target / fresh.durationMillis : 0 });
  },

  _savePlayRecord: (updates = {}, options = {}) => {
    const { immediate = false } = options;
    if (!immediate) {
      if (get()._isRecordSaveThrottled) {
        return;
      }
      set({ _isRecordSaveThrottled: true });
      setTimeout(() => {
        set({ _isRecordSaveThrottled: false });
      }, 10000); // 10 seconds
    }

    const { detail } = useDetailStore.getState();
    const { currentEpisodeIndex, episodes, status, introEndTime, outroStartTime, recapEndTime } = get();
    if (detail && status?.isLoaded) {
      const existingRecord = {
        introEndTime,
        outroStartTime,
        recapEndTime,
      };
      PlayRecordManager.save(detail.source, detail.id.toString(), {
        title: detail.title,
        cover: detail.poster || "",
        index: currentEpisodeIndex + 1,
        total_episodes: episodes.length,
        play_time: Math.floor(status.positionMillis / 1000),
        total_time: status.durationMillis ? Math.floor(status.durationMillis / 1000) : 0,
        source_name: detail.source_name,
        year: detail.year || "",
        ...existingRecord,
        ...updates,
      });
    }
  },

  handlePlaybackStatusUpdate: (newStatus) => {
    if (!newStatus.isLoaded) {
      if (newStatus.error) {
        logger.debug(`Playback Error: ${newStatus.error}`);
      }
      set({ status: newStatus });
      return;
    }

    const { currentEpisodeIndex, episodes, outroStartTime, playEpisode } = get();
    const detail = useDetailStore.getState().detail;

    // 自动跳过片头：进入片头区间后一次性跳到片头结束
    if (get().autoSkipIntro && newStatus.durationMillis) {
      const isSeries = episodes.length > 1;
      const introEnd = get().introEndTime || (isSeries ? 85_000 : 0);
      if (
        introEnd > 0 &&
        newStatus.positionMillis < introEnd - 2000 &&
        get()._autoSkippedAt === undefined
      ) {
        set({ _autoSkippedAt: currentEpisodeIndex } as any);
        get().skipTo(introEnd);
      }
    }

    if (detail && newStatus.durationMillis) {
      get()._savePlayRecord();

      const isNearEnd = newStatus.positionMillis / newStatus.durationMillis > 0.95;
      if (isNearEnd && currentEpisodeIndex < episodes.length - 1 && !outroStartTime) {
        set({ showNextEpisodeOverlay: true });
      } else {
        set({ showNextEpisodeOverlay: false });
      }
    }

    if (newStatus.didJustFinish) {
      // 睡眠定时"播完本片结束"：停在结尾，不再续播
      if (get().sleepUntilEnd) {
        set({ sleepUntilEnd: false, sleepRemainingMs: null });
        get().resetSleepTimer();
        Toast.show({ type: "info", text1: "睡眠定时", text2: "本片已播完，已停止播放" });
      } else if (get().autoPlayNext && currentEpisodeIndex < episodes.length - 1) {
        // 连续播放开关打开时才自动下一集
        playEpisode(currentEpisodeIndex + 1);
      }
    }

    const progressPosition = newStatus.durationMillis ? newStatus.positionMillis / newStatus.durationMillis : 0;
    set({ status: newStatus, progressPosition });
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setShowControls: (show) => set({ showControls: show }),
  setShowEpisodeModal: (show) => set({ showEpisodeModal: show }),
  setShowSourceModal: (show) => set({ showSourceModal: show }),
  setShowSpeedModal: (show) => set({ showSpeedModal: show }),
  setShowNextEpisodeOverlay: (show) => set({ showNextEpisodeOverlay: show }),

  setPlaybackRate: async (rate) => {
    const { videoRef } = get();
    const detail = useDetailStore.getState().detail;
    
    try {
      await videoRef?.current?.setRateAsync(rate, true);
      set({ playbackRate: rate });
      
      // Save the playback rate preference
      if (detail) {
        await PlayerSettingsManager.save(detail.source, detail.id.toString(), { playbackRate: rate });
      }
    } catch (error) {
      logger.debug("Failed to set playback rate:", error);
    }
  },

  reset: () => {
    set({
      episodes: [],
      currentEpisodeIndex: 0,
      status: null,
      isLoading: true,
      showControls: false,
      showEpisodeModal: false,
      showSourceModal: false,
      showSpeedModal: false,
      showNextEpisodeOverlay: false,
      initialPosition: 0,
      playbackRate: 1.0,
      introEndTime: undefined,
      outroStartTime: undefined,
      recapEndTime: undefined,
      userPaused: false,
      seekHudVisible: false,
      showMarkersModal: false,
    });
  },

  handleVideoError: async (errorType: 'ssl' | 'network' | 'other', failedUrl: string) => {
    const perfStart = performance.now();
    logger.error(`[VIDEO_ERROR] Handling ${errorType} error for URL: ${failedUrl}`);
    
    const detailStoreState = useDetailStore.getState();
    const { detail } = detailStoreState;
    const { currentEpisodeIndex } = get();
    
    if (!detail) {
      logger.error(`[VIDEO_ERROR] Cannot fallback - no detail available`);
      set({ isLoading: false });
      return;
    }
    
    // 标记当前source为失败
    const currentSource = detail.source;
    const errorReason = `${errorType} error: ${failedUrl.substring(0, 100)}...`;
    useDetailStore.getState().markSourceAsFailed(currentSource, errorReason);
    
    // 获取下一个可用的source
    const fallbackSource = useDetailStore.getState().getNextAvailableSource(currentSource, currentEpisodeIndex);
    
    if (!fallbackSource) {
      logger.error(`[VIDEO_ERROR] No fallback sources available for episode ${currentEpisodeIndex + 1}`);
      Toast.show({ 
        type: "error", 
        text1: "播放失败", 
        text2: "所有播放源都不可用，请稍后重试" 
      });
      set({ isLoading: false });
      return;
    }
    
    logger.info(`[VIDEO_ERROR] Switching to fallback source: ${fallbackSource.source} (${fallbackSource.source_name})`);
    
    try {
      // 更新DetailStore的当前detail为fallback source
      await useDetailStore.getState().setDetail(fallbackSource);
      
      // 重新加载当前集数的episodes
      const newEpisodes = fallbackSource.episodes || [];
      if (newEpisodes.length > currentEpisodeIndex) {
        const mappedEpisodes = newEpisodes.map((ep, index) => ({
          url: ep,
          title: `第 ${index + 1} 集`,
        }));
        
        set({
          episodes: mappedEpisodes,
          isLoading: false, // 让Video组件重新渲染
        });
        
        const perfEnd = performance.now();
        logger.info(`[VIDEO_ERROR] Successfully switched to fallback source in ${(perfEnd - perfStart).toFixed(2)}ms`);
        logger.info(`[VIDEO_ERROR] New episode URL: ${newEpisodes[currentEpisodeIndex].substring(0, 100)}...`);
        
        Toast.show({ 
          type: "success", 
          text1: "已切换播放源", 
          text2: `正在使用 ${fallbackSource.source_name}` 
        });
      } else {
        logger.error(`[VIDEO_ERROR] Fallback source doesn't have episode ${currentEpisodeIndex + 1}`);
        set({ isLoading: false });
      }
    } catch (error) {
      logger.error(`[VIDEO_ERROR] Failed to switch to fallback source:`, error);
      set({ isLoading: false });
    }
  },
}));

export default usePlayerStore;

export const selectCurrentEpisode = (state: PlayerState) => {
  // 增强数据安全性检查
  if (
    state.episodes &&
    Array.isArray(state.episodes) &&
    state.episodes.length > 0 &&
    state.currentEpisodeIndex >= 0 &&
    state.currentEpisodeIndex < state.episodes.length
  ) {
    const episode = state.episodes[state.currentEpisodeIndex];
    // 确保episode有有效的URL
    if (episode && episode.url && episode.url.trim() !== "") {
      return episode;
    } else {
      // 仅在调试模式下打印
      if (__DEV__) {
        logger.debug(`[PERF] selectCurrentEpisode - episode found but invalid URL: ${episode?.url}`);
      }
    }
  } else {
    // 仅在调试模式下打印
    if (__DEV__) {
      logger.debug(`[PERF] selectCurrentEpisode - no valid episode: episodes.length=${state.episodes?.length}, currentIndex=${state.currentEpisodeIndex}`);
    }
  }
  return undefined;
};
