import { requireNativeModule } from "expo-modules-core";

const NativeAVPlayer = requireNativeModule("AVPlayerView");

type ProgressPayload = {
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
};

/** 以全屏模态呈现原生 AVPlayerViewController */
export const presentPlayer = (url: string, positionMs: number = 0): void => {
  NativeAVPlayer.present(url, positionMs);
};

/** 模块连通性探针，返回 "pong" 表示原生模块的 Function 可用 */
export const ping = (): string => NativeAVPlayer.ping();

/** 读取原生侧内存日志（呈现流程的每一步都在里面） */
export const getLog = (): string => NativeAVPlayer.getLog();

/** 关闭原生播放器（不触发 onDismiss） */
export const dismissPlayer = (): void => {
  NativeAVPlayer.dismiss();
};

export const addPlayerListener = (
  event: "onProgress" | "onStateChange" | "onDismiss" | "onError" | "onStage",
  listener: (payload: any) => void
) => NativeAVPlayer.addListener(event, listener);

export type { ProgressPayload };
