import * as ReactNative from "react-native";

/**
 * 平台安全的 TV 遥控事件订阅。
 *
 * `useTVEventHandler` 只有 react-native-tvos（Apple TV / Android TV）才有；
 * react-native-web 里不存在，直接调用会抛
 * `useTVEventHandler is not a function` 并把整页打崩（历史上点击设置页即崩溃）。
 *
 * 这里在模块加载时做一次判定，非 TV 平台退化为“空订阅”，
 * 保证 web / iOS 手机上渲染同一套页面不报错，TV 上行为完全不变。
 */
const nativeUseTVEventHandler = (ReactNative as any).useTVEventHandler as
  | ((callback: (event: any) => void) => void)
  | undefined;

const noopSubscribe = (_callback: (event: any) => void) => {
  // 非 TV 平台没有遥控器事件，保持 hooks 调用形态一致即可
};

export const useTVEventHandler: (callback: (event: any) => void) => void =
  typeof nativeUseTVEventHandler === "function"
    ? nativeUseTVEventHandler
    : noopSubscribe;
