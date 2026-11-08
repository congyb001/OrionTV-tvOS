import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  findNodeHandle,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Search, Heart, Settings } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import VideoCard from "@/components/VideoCard";
import { StyledButton } from "@/components/StyledButton";
import useHomeStore, { Category } from "@/stores/homeStore";
import useAuthStore from "@/stores/authStore";
import { useApiConfig } from "@/hooks/useApiConfig";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { api } from "@/services/api";
import { useTVEventHandler } from "@/utils/tvEventHandler";

// 距离底部多少像素时触发加载下一页
const LOAD_MORE_THRESHOLD = 600;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deviceType, spacing } = useResponsiveLayout();

  const {
    categories,
    selectedCategory,
    contentData,
    loading,
    loadingMore,
    error,
    fetchInitialData,
    loadMoreData,
    selectCategory,
    refreshPlayRecords,
  } = useHomeStore();
  const { isLoggedIn } = useAuthStore();
  const apiConfigStatus = useApiConfig();

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const gearRef = useRef<any>(null);
  const [upTag, setUpTag] = useState<number | undefined>(undefined);
  const loadingMoreRef = useRef(false);

  // 电视墙铺满屏幕：按屏幕宽度算列数与卡片尺寸
  const { width } = useWindowDimensions();
  const paddingH = 16;
  const gap = 12;
  const targetCardW = deviceType === "tv" ? 200 : 150;
  const columns = Math.max(2, Math.floor((width - paddingH * 2 + gap) / (targetCardW + gap)));
  const cardWidth = Math.floor((width - paddingH * 2 - gap * (columns - 1)) / columns);
  const cardHeight = Math.round(cardWidth * 1.5);

  // 把一维列表按列数切成一行一行的电视墙
  const rows = useMemo(() => {
    const out: any[][] = [];
    for (let i = 0; i < contentData.length; i += columns) {
      out.push(contentData.slice(i, i + columns));
    }
    return out;
  }, [contentData, columns]);

  useFocusEffect(
    useCallback(() => {
      refreshPlayRecords();
    }, [refreshPlayRecords])
  );

  // 记录齿轮按钮的原生 tag，供分类行"向上"焦点指向
  useEffect(() => {
    // 轮询几次直到拿到原生节点句柄（挂载完成前 findNodeHandle 可能返回 null）
    const timers = [0, 400, 1200, 2500].map((d) =>
      setTimeout(() => {
        const tag = findNodeHandle(gearRef.current);
        if (tag) setUpTag(tag);
      }, d)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // 容器分类默认选中第一个标签
  useEffect(() => {
    if (!selectedCategory) return;
    if (selectedCategory.tags && !selectedCategory.tag) {
      const defaultTag = selectedCategory.tags[0];
      setSelectedTag(defaultTag);
      selectCategory({ ...selectedCategory, tag: defaultTag });
    }
  }, [selectedCategory, selectCategory]);

  useEffect(() => {
    if (!selectedCategory) return;
    if (apiConfigStatus.isConfigured && !apiConfigStatus.needsConfiguration) {
      if (selectedCategory.tags && selectedCategory.tag) fetchInitialData();
      else if (!selectedCategory.tags) fetchInitialData();
    }
  }, [
    selectedCategory,
    selectedCategory?.tag,
    apiConfigStatus.isConfigured,
    apiConfigStatus.needsConfiguration,
    fetchInitialData,
  ]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const handleCategorySelect = (category: Category) => {
    setSelectedTag(null);
    selectCategory(category);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag);
    if (selectedCategory) selectCategory({ ...selectedCategory, tag });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const rest = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (rest < LOAD_MORE_THRESHOLD && !loadingMoreRef.current) {
      loadMoreData();
    }
  };

  const renderTopBar = () => (
    <View style={[styles.topBar, { paddingTop: Math.max(insets.top, deviceType === "tv" ? 34 : 14) }]}>
      <Text style={styles.brand}>OrionTV</Text>
      <View style={styles.topActions}>
        <TopIcon onPress={() => router.push("/search")} label="搜索">
          <Search color="#fff" size={22} />
        </TopIcon>
        <TopIcon onPress={() => router.push("/favorites")} label="收藏">
          <Heart color="#fff" size={22} />
        </TopIcon>
        <TopIcon onPress={() => router.push("/settings")} label="设置" pressableRef={gearRef}>
          <Settings color="#fff" size={22} />
        </TopIcon>
      </View>
    </View>
  );

  const emptyText = () => {
    if (apiConfigStatus.needsConfiguration || !apiConfigStatus.isConfigured) {
      return "请点击上方齿轮，填入服务器地址";
    }
    if (error) return error;
    return "该分类暂无内容，试试其它分类";
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: paddingH }]}
        removeClippedSubviews={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {renderTopBar()}

        <View style={styles.tabs}>
          {categories.map((cat) => (
            <StyledButton
              key={cat.title}
              text={cat.title}
              variant="ghost"
              isSelected={selectedCategory?.title === cat.title}
              onPress={() => handleCategorySelect(cat)}
              nextFocusUp={upTag}
              style={styles.tabButton}
            />
          ))}
          {/* 兜底入口：即使顶栏图标拿不到焦点，也能在分类行进入搜索/设置 */}
          <StyledButton text="搜索" variant="ghost" onPress={() => router.push("/search")} style={styles.tabButton} />
          <StyledButton text="设置" variant="ghost" onPress={() => router.push("/settings")} style={styles.tabButton} />
        </View>

        {selectedCategory?.tags ? (
          <View style={styles.subTabs}>
            {selectedCategory.tags.map((tag) => (
              <StyledButton
                key={tag}
                text={tag}
                variant="ghost"
                isSelected={(selectedCategory.tag || selectedTag) === tag}
                onPress={() => handleTagSelect(tag)}
                nextFocusUp={upTag}
                style={styles.subTabButton}
              />
            ))}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{emptyText()}</Text>
            {!isLoggedIn && apiConfigStatus.isConfigured ? (
              <Text style={styles.emptyHint}>登录后会弹出登录框</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.gridRow}>
                {row.map((item: any, colIndex) => (
                  <View key={`${item?.id ?? "x"}-${colIndex}`} style={styles.cell}>
                    <VideoCard
                      cardWidth={cardWidth}
                      cardHeight={cardHeight}
                      id={item.id}
                      source={item.source}
                      title={item.title}
                      poster={item.poster}
                      year={item.year}
                      rate={item.rate}
                      progress={item.progress}
                      playTime={item.play_time}
                      episodeIndex={item.episodeIndex}
                      sourceName={item.sourceName}
                      totalEpisodes={item.totalEpisodes}
                      api={api}
                      onRecordDeleted={fetchInitialData}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {loadingMore ? <ActivityIndicator style={{ marginVertical: 24 }} color="#fff" /> : null}
      </ScrollView>
    </View>
  );
}

const TopIcon = ({
  onPress,
  label,
  children,
  pressableRef,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
  pressableRef?: React.RefObject<any>;
}) => {
  const [focused, setFocused] = useState(false);
  const firedAt = useRef(0);

  const fire = () => {
    const now = Date.now();
    if (now - firedAt.current < 400) return;
    firedAt.current = now;
    onPress();
  };

  useTVEventHandler((evt: any) => {
    if (!focused) return;
    if (evt?.eventType === "select" || evt?.eventType === "longSelect") fire();
  });

  return (
    <Pressable
      ref={pressableRef}
      focusable
      accessible
      accessibilityLabel={label}
      onPress={fire}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.topIcon, focused && styles.topIconFocused]}
    >
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0B0D",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
  },
  topActions: {
    flexDirection: "row",
    gap: 12,
  },
  topIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 2,
    borderColor: "transparent",
  },
  topIconFocused: {
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(255,255,255,0.18)",
    transform: [{ scale: 1.08 }],
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  subTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 6,
  },
  subTabButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  grid: {
    marginTop: 6,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  cell: {
    alignItems: "flex-start",
  },
  emptyBox: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 20,
    textAlign: "center",
  },
  emptyHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 15,
    textAlign: "center",
  },
});
