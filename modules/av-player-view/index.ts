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

/** 关闭原生播放器（不触发 onDismiss） */
export const dismissPlayer = (): void => {
  NativeAVPlayer.dismiss();
};

export const addPlayerListener = (
  event: "onProgress" | "onStateChange" | "onDismiss" | "onError",
  listener: (payload: any) => void
) => NativeAVPlayer.addListener(event, listener);

export type { ProgressPayload };
