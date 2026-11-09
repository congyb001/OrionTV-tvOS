import React from "react";
import { View, Text, StyleSheet, Modal, ScrollView } from "react-native";
import { StyledButton } from "./StyledButton";
import usePlayerStore from "@/stores/playerStore";
import useDetailStore from "@/stores/detailStore";

const pad = (n: number) => n.toString().padStart(2, "0");
const fmtDuration = (ms?: number) => {
  if (!ms) return "未知";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
};

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.row}>{children}</View>
);

const RowLabel: React.FC<{ label: string; hint?: string }> = ({ label, hint }) => (
  <View style={styles.rowText}>
    <Text style={styles.rowLabel}>{label}</Text>
    {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
  </View>
);

const ToggleRow: React.FC<{ label: string; hint?: string; value: boolean; onToggle: () => void }> = ({
  label,
  hint,
  value,
  onToggle,
}) => (
  <Row>
    <RowLabel label={label} hint={hint} />
    <StyledButton
      text={value ? "已开启" : "已关闭"}
      isSelected={value}
      onPress={onToggle}
      style={styles.toggleButton}
      textStyle={styles.smallText}
    />
  </Row>
);

const ActionRow: React.FC<{ label: string; hint?: string; action: string; onPress: () => void }> = ({
  label,
  hint,
  action,
  onPress,
}) => (
  <Row>
    <RowLabel label={label} hint={hint} />
    <StyledButton text={action} onPress={onPress} style={styles.toggleButton} textStyle={styles.smallText} />
  </Row>
);

/**
 * 播放页右侧面板：简介 / 音乐 / 设置 / 睡眠定时 / 音频与倍速。
 * 版式对齐芒果 TV 播放页的右侧浮层。
 */
export const PlayerPanels: React.FC = () => {
  const {
    activePanel,
    setActivePanel,
    episodes,
    currentEpisodeIndex,
    status,
    setShowSourceModal,
    setShowMarkersModal,
    autoPlayNext,
    setAutoPlayNext,
    cover43,
    setCover43,
    autoSkipIntro,
    setAutoSkipIntro,
    skipIntroHint,
    setSkipIntroHint,
    startSleepTimer,
    resetSleepTimer,
    sleepRemainingMs,
    playEpisode,
    skipTo,
    playbackRate,
    setPlaybackRate,
  } = usePlayerStore();
  const { detail } = useDetailStore();

  const statusAny = status as any;
  const duration = statusAny?.durationMillis || 0;
  const hasNext = currentEpisodeIndex < episodes.length - 1;

  const close = () => setActivePanel(null);

  const renderContent = () => {
    switch (activePanel) {
      case "info":
        return (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.panelTitle}>{detail?.title || ""}</Text>
            <Text style={styles.panelSub}>
              第 {currentEpisodeIndex + 1} 期 · {fmtDuration(duration)}
            </Text>

            <View style={styles.chips}>
              <Chip text={detail?.source_name || "默认源"} />
              <Chip text={(detail as any)?.remarks || "正片"} />
              <Chip text={detail?.year || "—"} />
            </View>

            {detail?.desc ? <Text style={styles.desc}>{detail.desc}</Text> : null}

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>选集</Text>
            <View style={styles.episodeGrid}>
              {episodes.map((ep, index) => (
                <StyledButton
                  key={`${ep.url}-${index}`}
                  text={`${index + 1}`}
                  isSelected={index === currentEpisodeIndex}
                  onPress={() => {
                    close();
                    if (index !== currentEpisodeIndex) playEpisode(index);
                  }}
                  style={styles.episodeButton}
                  textStyle={styles.smallText}
                />
              ))}
            </View>

            <View style={styles.actionButtons}>
              <StyledButton
                text="从头开始"
                onPress={() => {
                  close();
                  skipTo(0);
                }}
                style={styles.wideButton}
              />
              <StyledButton
                text={hasNext ? `第 ${currentEpisodeIndex + 2} 期` : "已是最后一期"}
                variant={hasNext ? "primary" : "ghost"}
                disabled={!hasNext}
                onPress={() => {
                  close();
                  if (hasNext) playEpisode(currentEpisodeIndex + 1);
                }}
                style={styles.wideButton}
              />
            </View>
          </ScrollView>
        );

      case "music":
        return (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.panelTitle}>音乐</Text>
            <Text style={styles.panelSub}>正在播放：{detail?.title || ""}</Text>
            <View style={styles.divider} />
            <Text style={styles.rowLabel}>背景音乐识别</Text>
            <Text style={styles.rowHint}>
              音乐识别需要音频指纹服务（芒果 TV 那种“最新识别”能力），本版本未接入，
              暂时无法显示片中的歌曲。这里保留入口，接入服务后即可展示。
            </Text>
            <View style={styles.divider} />
            <Text style={styles.rowLabel}>片尾曲</Text>
            <Text style={styles.rowHint}>可在「设置 → 片头片尾标记」里把片尾起点记下来，播到那里会提示跳过。</Text>
          </ScrollView>
        );

      case "settings":
        return (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>连续播放</Text>
            <ToggleRow
              label="允许下一集"
              hint="本集播完自动开始下一集"
              value={autoPlayNext}
              onToggle={() => setAutoPlayNext(!autoPlayNext)}
            />

            <Text style={styles.sectionLabel}>播放覆盖层</Text>
            <ToggleRow label="4:3 覆盖层" hint="按 4:3 比例显示画面" value={cover43} onToggle={() => setCover43(!cover43)} />

            <Text style={styles.sectionLabel}>自动跳过片头</Text>
            <ToggleRow
              label="自动跳过片头"
              hint="进入片头区间后直接跳到片头结束"
              value={autoSkipIntro}
              onToggle={() => setAutoSkipIntro(!autoSkipIntro)}
            />
            <ToggleRow
              label="跳过片头提示"
              hint="右下角显示“跳过片头 / 上集回顾 / 片尾”按钮"
              value={skipIntroHint}
              onToggle={() => setSkipIntroHint(!skipIntroHint)}
            />

            <Text style={styles.sectionLabel}>其它</Text>
            <ActionRow
              label="切换播放源"
              hint="当前源播放失败或想换线路"
              action="打开"
              onPress={() => {
                close();
                setShowSourceModal(true);
              }}
            />
            <ActionRow
              label="片头片尾标记"
              hint="记录片头结束、上集回顾结束、片尾开始"
              action="打开"
              onPress={() => {
                close();
                setShowMarkersModal(true);
              }}
            />
          </ScrollView>
        );

      case "sleep":
        return (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.panelTitle}>睡眠倒计时</Text>
            <Text style={styles.panelSub}>
              {sleepRemainingMs
                ? `剩余 ${Math.floor(sleepRemainingMs / 60000)} 分 ${pad(
                    Math.floor((sleepRemainingMs % 60000) / 1000)
                  )} 秒`
                : "当前未开启"}
            </Text>
            <View style={styles.divider} />
            <StyledButton text="+ 15 分钟" onPress={() => startSleepTimer(15)} style={styles.optionButton} />
            <StyledButton text="+ 45 分钟" onPress={() => startSleepTimer(45)} style={styles.optionButton} />
            <StyledButton text="+ 1 小时 30 分钟" onPress={() => startSleepTimer(90)} style={styles.optionButton} />
            <StyledButton
              text="直到本影片播放结束"
              onPress={() => startSleepTimer("end")}
              style={styles.optionButton}
            />
            <StyledButton text="重置倒计时" variant="ghost" onPress={resetSleepTimer} style={styles.optionButton} />
          </ScrollView>
        );

      case "audio":
        return (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>播放速度</Text>
            <View style={styles.speedGrid}>
              {SPEED_OPTIONS.map((rate) => (
                <StyledButton
                  key={rate}
                  text={`${rate}x`}
                  isSelected={playbackRate === rate}
                  onPress={() => setPlaybackRate(rate)}
                  style={styles.speedButton}
                  textStyle={styles.smallText}
                />
              ))}
            </View>

            <Text style={styles.sectionLabel}>音频轨道</Text>
            <Row>
              <RowLabel label="当前音轨" hint="由片源决定，暂不支持在客户端切换" />
              <Text style={styles.valueText}>Track 1 (aac) · 2 ch</Text>
            </Row>

            <Text style={styles.sectionLabel}>音频调整</Text>
            <Row>
              <RowLabel label="突显对话" hint="需要原生音频处理，本版本未接入" />
              <Text style={styles.valueText}>关闭</Text>
            </Row>
            <Row>
              <RowLabel label="降低高音量" hint="需要原生音频处理，本版本未接入" />
              <Text style={styles.valueText}>关闭</Text>
            </Row>
            <Row>
              <RowLabel label="音量" hint="tvOS 音量由系统控制，App 内不能调节" />
              <Text style={styles.valueText}>系统音量</Text>
            </Row>
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <Modal visible={activePanel !== null} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.panel}>{renderContent()}</View>
      </View>
    </Modal>
  );
};

const Chip: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.chip}>
    <Text style={styles.chipText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  panel: {
    width: 620,
    height: "100%",
    backgroundColor: "rgba(10,10,10,0.92)",
    paddingHorizontal: 28,
    paddingVertical: 30,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  panelTitle: {
    color: "white",
    fontSize: 26,
    fontWeight: "700",
  },
  panelSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    marginTop: 6,
    marginBottom: 14,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  chipText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
  },
  desc: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 21,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: 16,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    marginTop: 14,
    marginBottom: 8,
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  rowHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  valueText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    maxWidth: 220,
    textAlign: "right",
  },
  toggleButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 90,
  },
  smallText: {
    fontSize: 14,
  },
  episodeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  episodeButton: {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  wideButton: {
    flex: 1,
    paddingVertical: 10,
  },
  optionButton: {
    marginBottom: 10,
    paddingVertical: 12,
  },
  speedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  speedButton: {
    minWidth: 88,
    paddingVertical: 8,
  },
});
