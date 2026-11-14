import { requireNativeViewManager } from "expo-modules-core";

/**
 * 原生 AVPlayerViewController 视图。
 * 播放界面完全由 tvOS 原生播放器提供，RN 侧只传 url / 起始位置。
 */
const NativeAVPlayerView = requireNativeViewManager("AVPlayerView");

export default NativeAVPlayerView;
