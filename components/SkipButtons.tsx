import React from "react";
import { View, StyleSheet } from "react-native";
import { StyledButton } from "./StyledButton";
import usePlayerStore from "@/stores/playerStore";

/** 片头默认结束时间：剧集没有手动标记时，前 85 秒按片头处理 */
export const DEFAULT_INTRO_END_MS = 85_000;
/** 片尾默认时长：剧集没有手动标记时，最后 90 秒算片尾 */
export const DEFAULT_OUTRO_WINDOW_MS = 90_000;

const formatSeconds = (ms: number) => `${Math.round(ms / 1000)}s`;

export const SkipButtons: React.FC = () => {
  const {
    status,
    episodes,
    currentEpisodeIndex,
    recapEndTime,
    introEndTime,
    outroStartTime,
    skipTo,
    playEpisode,
    skipIntroHint,
  } = usePlayerStore();

  const loaded: any = status?.isLoaded ? (status as any) : null;
  if (!loaded || !loaded.durationMillis) return null;

  const position = loaded.positionMillis || 0;
  const duration = loaded.durationMillis;
  // 单集（电影）不猜片头片尾，只有手动标记过才显示
  const isSeries = episodes.length > 1;

  const recapEnd = recapEndTime || 0;
  const introEnd = introEndTime || (isSeries ? DEFAULT_INTRO_END_MS : 0);
  const outroWindow = outroStartTime || (isSeries ? DEFAULT_OUTRO_WINDOW_MS : 0);

  const showRecap = skipIntroHint && recapEnd > 0 && position < recapEnd - 1000;
  const showIntro = skipIntroHint && introEnd > recapEnd && position >= recapEnd && position < introEnd - 1000;
  const showOutro = skipIntroHint && outroWindow > 0 && duration - position <= outroWindow && duration - position > 1000;

  const hasNext = currentEpisodeIndex < episodes.length - 1;

  const onSkipOutro = () => {
    if (hasNext) {
      playEpisode(currentEpisodeIndex + 1);
    } else {
      skipTo(Math.max(0, duration - 300));
    }
  };

  if (!showRecap && !showIntro && !showOutro) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {showRecap && (
        <StyledButton
          variant="default"
          onPress={() => skipTo(recapEnd)}
          text={`跳过上集回顾 · ${formatSeconds(recapEnd)}`}
          accessibilityLabel="跳过上集回顾"
          style={styles.button}
          textStyle={styles.buttonText}
        />
      )}
      {showIntro && (
        <StyledButton
          variant="default"
          onPress={() => skipTo(introEnd)}
          text={`跳过片头 · ${formatSeconds(introEnd)}`}
          accessibilityLabel="跳过片头"
          style={styles.button}
          textStyle={styles.buttonText}
        />
      )}
      {showOutro && (
        <StyledButton
          variant="default"
          onPress={onSkipOutro}
          text={hasNext ? "跳过片尾 · 下一集" : "跳过片尾"}
          accessibilityLabel="跳过片尾"
          style={styles.button}
          textStyle={styles.buttonText}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 60,
    bottom: 170,
    alignItems: "flex-end",
    gap: 12,
  },
  button: {
    backgroundColor: "rgba(20, 20, 20, 0.82)",
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
});
