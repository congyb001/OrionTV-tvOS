import { useEffect, useRef, useCallback } from "react";
import type { HWEvent } from "react-native";
import { useTVEventHandler } from "@/utils/tvEventHandler";
import usePlayerStore from "@/stores/playerStore";

const SEEK_STEP = 10 * 1000; // 快进/快退 10 秒

// 定时器延迟时间（毫秒）
const CONTROLS_TIMEOUT = 5000;

/**
 * 管理播放器控件的显示/隐藏、遥控器事件和自动隐藏定时器。
 * @returns onScreenPress - 一个函数，用于处理屏幕点击事件，以显示控件并重置定时器。
 */
export const useTVRemoteHandler = () => {
  const { showControls, setShowControls, showEpisodeModal, togglePlayPause, seek } = usePlayerStore();

  const controlsTimer = useRef<NodeJS.Timeout | null>(null);
  // 遥控事件去重：tvOS 同一次按键可能下发 down/up 两个事件，避免播放/暂停被切两次
  const lastEventAt = useRef<Record<string, number>>({});
  // 连续快进/快退的宽限期：刚用左右键跳过时，控制条虽已显示，左右键仍继续跳转
  const lastSeekAt = useRef(0);
  const fastForwardIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 重置或启动隐藏控件的定时器
  const resetTimer = useCallback(() => {
    // 清除之前的定时器
    if (controlsTimer.current) {
      clearTimeout(controlsTimer.current);
    }
    // 设置新的定时器
    controlsTimer.current = setTimeout(() => {
      setShowControls(false);
    }, CONTROLS_TIMEOUT);
  }, [setShowControls]);

  // 当控件显示时，启动定时器
  useEffect(() => {
    if (showControls) {
      resetTimer();
    } else {
      // 如果控件被隐藏，清除定时器
      if (controlsTimer.current) {
        clearTimeout(controlsTimer.current);
      }
    }

    // 组件卸载时清除定时器
    return () => {
      if (controlsTimer.current) {
        clearTimeout(controlsTimer.current);
      }
    };
  }, [showControls, resetTimer]);

  // 组件卸载时清除快进定时器
  useEffect(() => {
    return () => {
      if (fastForwardIntervalRef.current) {
        clearInterval(fastForwardIntervalRef.current);
      }
    };
  }, []);

  // 处理遥控器事件
  const handleTVEvent = useCallback(
    (event: HWEvent) => {
      if (showEpisodeModal) {
        return;
      }

      const type: any = (event as any).eventType;
      const now = Date.now();
      const last = lastEventAt.current[type] || 0;
      if (now - last < 250) {
        return;
      }
      lastEventAt.current[type] = now;

      if (event.eventType === "longRight" || event.eventType === "longLeft") {
        if (event.eventKeyAction === 1) {
          if (fastForwardIntervalRef.current) {
            clearInterval(fastForwardIntervalRef.current);
            fastForwardIntervalRef.current = null;
          }
        }
      }

      // 遥控器独立的播放/暂停键：无论控制条是否显示都必须生效
      if (event.eventType === "playPause") {
        togglePlayPause();
        setShowControls(true);
        resetTimer();
        return;
      }

      resetTimer();

      if (showControls) {
        // 控制条已显示时，方向键主要用于在按钮之间移动。
        // 例外：刚刚用左右键跳过（2 秒内），继续响应急速连按
        if (
          (event.eventType === "left" || event.eventType === "right") &&
          Date.now() - lastSeekAt.current < 2000
        ) {
          lastSeekAt.current = Date.now();
          seek(event.eventType === "left" ? -SEEK_STEP : SEEK_STEP);
        }
        return;
      }

      switch (event.eventType) {
        case "select":
          togglePlayPause();
          setShowControls(true);
          break;
        case "left":
          setShowControls(true); // 左右键快进/快退时同时把控制条调出来
          lastSeekAt.current = Date.now();
          seek(-SEEK_STEP);
          break;
        case "longLeft":
          if (!fastForwardIntervalRef.current && event.eventKeyAction === 0) {
            fastForwardIntervalRef.current = setInterval(() => {
              seek(-SEEK_STEP); 
            }, 200);
          }
          break;
        case "right":
          setShowControls(true);
          lastSeekAt.current = Date.now();
          seek(SEEK_STEP);
          break;
        case "longRight":
          // 长按开始: 启动连续快进
          if (!fastForwardIntervalRef.current && event.eventKeyAction === 0) {
            fastForwardIntervalRef.current = setInterval(() => {
              seek(SEEK_STEP); 
            }, 200);
          }
          break;
        case "down":
        case "up":
          setShowControls(true);
          break;
      }
    },
    [showControls, showEpisodeModal, setShowControls, resetTimer, togglePlayPause, seek]
  );

  useTVEventHandler(handleTVEvent);

  // 处理屏幕点击事件
  const onScreenPress = () => {
    // 切换控件的显示状态
    const newShowControls = !showControls;
    setShowControls(newShowControls);

    // 如果控件变为显示状态，则重置定时器
    if (newShowControls) {
      resetTimer();
    }
  };

  return { onScreenPress };
};
