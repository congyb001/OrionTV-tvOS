import AsyncStorage from "@react-native-async-storage/async-storage";

// region: --- Interface Definitions ---
export interface DoubanItem {
  title: string;
  poster: string;
  rate?: string;
}

export interface DoubanResponse {
  code: number;
  message: string;
  list: DoubanItem[];
}

export interface VideoDetail {
  id: string;
  title: string;
  poster: string;
  source: string;
  source_name: string;
  desc?: string;
  type?: string;
  year?: string;
  area?: string;
  director?: string;
  actor?: string;
  remarks?: string;
}

export interface SearchResult {
  id: number;
  title: string;
  poster: string;
  episodes: string[];
  source: string;
  source_name: string;
  class?: string;
  year: string;
  desc?: string;
  type_name?: string;
}

export interface Favorite {
  cover: string;
  title: string;
  source_name: string;
  total_episodes: number;
  search_title: string;
  year: string;
  save_time?: number;
}

export interface PlayRecord {
  title: string;
  source_name: string;
  cover: string;
  index: number;
  total_episodes: number;
  play_time: number;
  total_time: number;
  save_time: number;
  year: string;
}

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

export interface ServerConfig {
  SiteName: string;
  StorageType: "localstorage" | "redis" | string;
}

export class API {
  public baseURL: string = "";

  // 后端类型：LunaTV（账号+密码，服务端存源）或 LibreTV（仅密码，源在 /api/status 里）
  public flavor: "lunatv" | "libretv" = "lunatv";
  public libreSources: Array<{ key: string; name: string; url: string; detail?: string }> = [];

  // 会话恢复回调（由 authStore 注册），401 时自动重登并重试一次
  private sessionRestorer: (() => Promise<boolean>) | null = null;

  constructor(baseURL?: string) {
    if (baseURL) {
      this.baseURL = baseURL;
    }
  }

  public setBaseUrl(url: string) {
    this.baseURL = url;
  }

  public setSessionRestorer(restorer: (() => Promise<boolean>) | null) {
    this.sessionRestorer = restorer;
  }

  private async _fetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.baseURL) {
      throw new Error("API_URL_NOT_SET");
    }

    // 框架默认会携带 cookie，无需手动设置
    const response = await fetch(`${this.baseURL}${url}`, options);

    if (response.status === 401) {
      // 会话过期：自动重登后重试一次（登录接口本身除外，避免循环）
      if (this.sessionRestorer && !url.startsWith("/api/login")) {
        const restored = await this.sessionRestorer();
        if (restored) {
          const retryResponse = await fetch(`${this.baseURL}${url}`, options);
          if (retryResponse.status === 401) {
            throw new Error("UNAUTHORIZED");
          }
          if (!retryResponse.ok) {
            throw new Error(`HTTP error! status: ${retryResponse.status}`);
          }
          return retryResponse;
        }
      }
      throw new Error("UNAUTHORIZED");
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} ${url}`);
    }

    return response;
  }

  /** 后端是否已识别为 LibreTV */
  private isLibre() {
    return this.flavor === "libretv";
  }

  // 兼容两种后端：
    // - LunaTV：POST /api/login {username, password} → {ok:true}
    // - LibreTV：POST /api/auth {password} → {success:true} + Set-Cookie
  async login(username?: string | undefined, password?: string): Promise<{ ok: boolean }> {
    if (!this.baseURL) throw new Error("API_URL_NOT_SET");

    const attempt = async (path: string, body: Record<string, any>) => {
      const response = await fetch(`${this.baseURL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const cookies = response.headers.get("Set-Cookie");
      if (cookies) {
        await AsyncStorage.setItem("authCookies", cookies);
      }
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      return { response, data };
    };

    const payload: Record<string, any> = { password };
    if (username) payload.username = username;

    // LibreTV：只有 /api/auth，直接用它，避免先打一个不存在的 /api/login
    if (this.isLibre()) {
      try {
        const { response, data } = await attempt("/api/auth", { password });
        if (data && (data.success === true || data.ok === true)) return { ok: true };
        if (response.ok && !data) return { ok: true };
        const reason =
          (data && typeof data.error === "string" && data.error) ||
          (data && typeof data.message === "string" && data.message) ||
          `登录失败（HTTP ${response.status}）`;
        throw new Error(reason);
      } catch (e: any) {
        if (e?.message && !e.message.startsWith("HTTP error")) throw e;
        throw new Error(e?.message || "登录失败");
      }
    }

    // 1) 先按 LunaTV 的 /api/login 试
    let errorText = "";
    try {
      const { response, data } = await attempt("/api/login", payload);
      if (data && (data.ok === true || data.success === true)) return { ok: true };
      if (response.ok && !data) return { ok: true };
      if (data && typeof data.error === "string") errorText = data.error;
      if (data && typeof data.message === "string") errorText = data.message;
    } catch (e: any) {
      errorText = e?.message || errorText;
    }

    // 2) 再按 LibreTV 的 /api/auth（只有密码）试
    try {
      const { response, data } = await attempt("/api/auth", { password });
      if (data && (data.success === true || data.ok === true)) return { ok: true };
      if (response.ok && !data) return { ok: true };
      if (data && typeof data.error === "string") errorText = data.error;
    } catch (e: any) {
      errorText = errorText || e?.message || "";
    }

    throw new Error(errorText && !errorText.startsWith("HTTP error") ? errorText : "用户名或密码错误");
  }

  async logout(): Promise<{ ok: boolean }> {
    const response = await this._fetch("/api/logout", {
      method: "POST",
    });
    await AsyncStorage.setItem("authCookies", '');
    return response.json();
  }

  async getServerConfig(): Promise<ServerConfig> {
    // 1) LunaTV：/api/server-config
    try {
      const response = await this._fetch("/api/server-config");
      const config = await response.json();
      if (config && config.StorageType) {
        this.flavor = "lunatv";
        return config;
      }
    } catch {
      // 继续识别 LibreTV
    }

    // 2) LibreTV：/api/status（公开接口）→ {passwordRequired, verified, defaultSources...}
    if (this.baseURL) {
      try {
        const probe = await fetch(`${this.baseURL}/api/status`, { method: "GET" });
        if (probe.ok) {
          const data: any = await probe.json();
          if (data && typeof data.passwordRequired === "boolean") {
            this.flavor = "libretv";
            this.libreSources = Array.isArray(data.defaultSources) ? data.defaultSources : [];
            // 收藏/播放记录在 LibreTV 上没有服务端接口，按本地存储处理
            return { SiteName: "LibreTV", StorageType: "localstorage" };
          }
        }
      } catch {
        // 探测失败，按错误上抛
      }
    }

    throw new Error("SERVER_CONFIG_UNAVAILABLE");
  }

  // LibreTV 会话校验：GET /api/auth → {success, verified}
  async getLibreAuthStatus(): Promise<boolean> {
    if (!this.baseURL) return false;
    try {
      const response = await fetch(`${this.baseURL}/api/auth`, { method: "GET" });
      if (!response.ok) return false;
      const data: any = await response.json();
      return !!data?.verified;
    } catch {
      return false;
    }
  }

  async getFavorites(key?: string): Promise<Record<string, Favorite> | Favorite | null> {
    const url = key ? `/api/favorites?key=${encodeURIComponent(key)}` : "/api/favorites";
    const response = await this._fetch(url);
    return response.json();
  }

  async addFavorite(key: string, favorite: Omit<Favorite, "save_time">): Promise<{ success: boolean }> {
    const response = await this._fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, favorite }),
    });
    return response.json();
  }

  async deleteFavorite(key?: string): Promise<{ success: boolean }> {
    const url = key ? `/api/favorites?key=${encodeURIComponent(key)}` : "/api/favorites";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  async getPlayRecords(): Promise<Record<string, PlayRecord>> {
    const response = await this._fetch("/api/playrecords");
    return response.json();
  }

  async savePlayRecord(key: string, record: Omit<PlayRecord, "save_time">): Promise<{ success: boolean }> {
    const response = await this._fetch("/api/playrecords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, record }),
    });
    return response.json();
  }

  async deletePlayRecord(key?: string): Promise<{ success: boolean }> {
    const url = key ? `/api/playrecords?key=${encodeURIComponent(key)}` : "/api/playrecords";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  async getSearchHistory(): Promise<string[]> {
    const response = await this._fetch("/api/searchhistory");
    return response.json();
  }

  async addSearchHistory(keyword: string): Promise<string[]> {
    const response = await this._fetch("/api/searchhistory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    return response.json();
  }

  async deleteSearchHistory(keyword?: string): Promise<{ success: boolean }> {
    const url = keyword ? `/api/searchhistory?keyword=${keyword}` : "/api/searchhistory";
    const response = await this._fetch(url, { method: "DELETE" });
    return response.json();
  }

  getImageProxyUrl(imageUrl: string): string {
    if (this.isLibre()) return imageUrl;
    return `${this.baseURL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  }

  async getDoubanData(
    type: "movie" | "tv",
    tag: string,
    pageSize: number = 16,
    pageStart: number = 0
  ): Promise<DoubanResponse> {
    const url = `/api/douban?type=${type}&tag=${encodeURIComponent(tag)}&pageSize=${pageSize}&pageStart=${pageStart}`;
    let response: Response;
    try {
      response = await this._fetch(url);
    } catch (e: any) {
      // 5xx 多为服务端拉豆瓣时的瞬时失败，隔一秒重试一次
      const statusMatch = /status: (\d{3})/.exec(e?.message || "");
      if (statusMatch && Number(statusMatch[1]) >= 500) {
        await new Promise((r) => setTimeout(r, 1000));
        response = await this._fetch(url);
      } else {
        throw e;
      }
    }
    const data: any = await response.json();
    if (this.isLibre()) {
      // LibreTV: {items:[{id,title,cover,rating,isTv}]}
      const list = (data?.items || []).map((it: any) => ({
        title: it.title || "",
        poster: it.cover || "",
        rate: it.rating || undefined,
      }));
      return { code: 200, message: "success", list };
    }
    return data;
  }

  async searchVideos(query: string): Promise<{ results: SearchResult[] }> {
    if (this.isLibre()) {
      return { results: await this.libretvSearch(query) };
    }
    const url = `/api/search?q=${encodeURIComponent(query)}`;
    const response = await this._fetch(url);
    return response.json();
  }

  async searchVideo(query: string, resourceId: string, signal?: AbortSignal): Promise<{ results: SearchResult[] }> {
    if (this.isLibre()) {
      return { results: await this.libretvSearch(query, resourceId) };
    }
    const url = `/api/search/one?q=${encodeURIComponent(query)}&resourceId=${encodeURIComponent(resourceId)}`;
    const response = await this._fetch(url, { signal });
    const { results } = await response.json();
    return { results: results.filter((item: any) => item.title === query )};
  }

  async getResources(signal?: AbortSignal): Promise<ApiSite[]> {
    if (this.isLibre()) {
      return this.libreSources.map((s) => ({ key: String(s.key), api: s.url, name: s.name, detail: s.detail }));
    }
    const url = `/api/search/resources`;
    const response = await this._fetch(url, { signal });
    return response.json();
  }

  async getVideoDetail(source: string, id: string): Promise<VideoDetail> {
    if (this.isLibre()) {
      const cfg = this.libreSources.find((s) => String(s.key) === String(source)) || {
        key: String(source),
        name: String(source),
        url: "",
      };
      const detail = await this.libretvDetail(cfg, String(id));
      const vi: any = detail?.videoInfo || {};
      return {
        id: String(id),
        title: vi.title || "",
        poster: vi.cover || "",
        source: String(cfg.key),
        source_name: vi.sourceName || cfg.name,
        desc: vi.desc,
        type: vi.typeName,
        year: vi.year,
        area: vi.area,
        director: vi.director,
        actor: vi.actor,
        remarks: vi.remarks,
        // LibreTV 的详情直接给出播放地址数组
        episodes: detail?.episodes || [],
      } as any;
    }
    const url = `/api/detail?source=${source}&id=${id}`;
    const response = await this._fetch(url);
    return response.json();
  }

  // ——— LibreTV 适配层 ———

  private async libretvSearch(query: string, onlyKey?: string): Promise<SearchResult[]> {
    if (!this.libreSources.length) {
      throw new Error("LibreTV 未配置采集源：请在后端设置 DEFAULT_SOURCES 环境变量");
    }
    const sources = onlyKey
      ? this.libreSources.filter((s) => String(s.key) === String(onlyKey))
      : this.libreSources.slice(0, 6);

    const response = await this._fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wd: query, sources, filterAdult: false }),
    });
    const data: any = await response.json();
    const list: any[] = (data?.list || []).slice(0, 12);

    // LibreTV 的搜索结果不含剧集地址，逐条补一次详情
    const withEpisodes = await Promise.all(
      list.map(async (it) => {
        const cfg = {
          key: it.sourceKey,
          name: it.sourceName,
          url: it.sourceUrl || (sources.find((s) => String(s.key) === String(it.sourceKey))?.url ?? ""),
        };
        const detail = await this.libretvDetail(cfg, String(it.vodId)).catch(() => null);
        return {
          id: Number(it.vodId) || 0,
          title: it.name || "",
          poster: it.pic || "",
          episodes: (detail?.episodes || []) as string[],
          source: String(it.sourceKey),
          source_name: it.sourceName || String(it.sourceKey),
          year: it.year || "",
          type_name: it.typeName,
          desc: it.remarks,
        } as SearchResult;
      })
    );
    return withEpisodes;
  }

  private async libretvDetail(
    cfg: { key: string; name: string; url: string; detail?: string },
    id: string
  ): Promise<{ episodes: string[]; videoInfo: any }> {
    const sourceParam = encodeURIComponent(JSON.stringify(cfg));
    const response = await this._fetch(`/api/detail?id=${encodeURIComponent(id)}&source=${sourceParam}`);
    return response.json();
  }
}

// 默认实例
export let api = new API();
