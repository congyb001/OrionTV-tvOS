/**
 * 全局唯一播放器守卫。
 *
 * tvOS 上 expo-av 的播放器不会在组件卸载时立刻释放，若同时存在两个活着的
 * Video 实例（上一个播放页还没释放、或同页切集重建），就会出现两路声音重叠。
 * 这里维护「当前唯一占用音频的播放器」：新播放器一旦开始加载，就把旧的显式
 * pause + unload 掉，保证任何时刻只有一路在出声。
 */

type PlaybackTarget = {
  pauseAsync?: () => Promise<unknown>;
  unloadAsync?: () => Promise<unknown>;
};

let activeTarget: PlaybackTarget | null = null;

const stopTarget = async (target: PlaybackTarget | null) => {
  if (!target) return;
  try {
    await target.pauseAsync?.();
  } catch {
    // 播放器可能已被释放，忽略
  }
  try {
    await target.unloadAsync?.();
  } catch {
    // 同上
  }
};

/** 声明自己为当前播放器，并停掉此前占用音频的播放器 */
export const claimPlayback = async (self: PlaybackTarget | null | undefined) => {
  if (!self) return;
  if (activeTarget && activeTarget !== self) {
    await stopTarget(activeTarget);
  }
  activeTarget = self;
};

/** 立刻停掉当前唯一占用的播放器（离开播放页、返回键时调用） */
export const stopActivePlayback = async () => {
  const target = activeTarget;
  activeTarget = null;
  await stopTarget(target);
};

/** 组件卸载时释放占用，避免旧引用挡住下一次播放 */
export const releasePlayback = async (self: PlaybackTarget | null | undefined) => {
  if (!self) return;
  if (activeTarget === self) {
    activeTarget = null;
  }
  await stopTarget(self);
};
