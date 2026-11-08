# OrionTV · tvOS 版

这是 [orion-lib/OrionTV](https://github.com/orion-lib/OrionTV) 的 Apple TV（tvOS）适配分支，改动集中在 tvOS 运行与播放体验。

- **下载安装包**：[Releases · v1.3.14](https://github.com/congyb001/OrionTV-tvOS/releases/latest)（`OrionTV_1.3.14_SinglePlayer.ipa`，未签名，需自行签名后安装，步骤见同页附件的《安装与配置说明.md》）
- 仓库内也保留一份：`release/OrionTV_1.3.14_SinglePlayer.ipa`
- **tvOS 关键改动**：
  - Xcode 27 / tvOS 27 SDK 适配（部署目标 `TVOS_DEPLOYMENT_TARGET = 15.0`，`NODE_BINARY` 指向绝对路径）
  - 设置页崩溃修复（`useTVEventHandler` 在非 TV 平台退化为 noop、`setNativeProps` 加类型判断）
  - 首页改为选项卡电视墙（`ScrollView` 手工分行布局，按屏宽算列宽，避免虚拟列表锁焦点）
  - 播放页：单播放器守卫、断点续播「先定位后播放」、快进「先暂停再跳转」、返回键一次退出
  - 遥控焦点：按钮 `Pressable onPress` 与全局 select 事件共用去重时间戳，避免一次按键触发两遍（曾导致 push 出两个播放页、两路声音重叠）
  - 后端兼容 LunaTV / LibreTV 双契约（探测 `/api/server-config` 与 `/api/status`）

构建：`./rebuild.sh`（出真机 ipa）或 `./rebuild.sh sim`（只出模拟器版）。

---

# OrionTV 📺

一个基于 React Native TVOS 和 Expo 构建的播放器，旨在提供流畅的视频观看体验。

## ✨ 功能特性

- **框架跨平台支持**: 同时支持构建 Apple TV 和 Android TV。
- **现代化前端**: 使用 Expo、React Native TVOS 和 TypeScript 构建，性能卓越。
- **Expo Router**: 基于文件系统的路由，使导航逻辑清晰简单。
- **TV 优化的 UI**: 专为电视遥控器交互设计的用户界面。

## 🛠️ 技术栈

- **前端**:
  - [React Native TVOS](https://github.com/react-native-tvos/react-native-tvos)
  - [Expo](https://expo.dev/) (~51.0)
  - [Expo Router](https://docs.expo.dev/router/introduction/)
  - [Expo AV](https://docs.expo.dev/versions/latest/sdk/av/)
  - TypeScript

## 📂 项目结构

本项目采用类似 monorepo 的结构：

```
.
├── app/              # Expo Router 路由和页面
├── assets/           # 静态资源 (字体, 图片, TV 图标)
├── components/       # React 组件
├── constants/        # 应用常量 (颜色, 样式)
├── hooks/            # 自定义 Hooks
├── services/         # 服务层 (API, 存储)
├── package.json      # 前端依赖和脚本
└── ...
```

## 🚀 快速开始

### 环境准备

请确保您的开发环境中已安装以下软件：

- [Node.js](https://nodejs.org/) (LTS 版本)
- [Yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Xcode](https://developer.apple.com/xcode/) (用于 Apple TV 开发)
- [Android Studio](https://developer.android.com/studio) (用于 Android TV 开发)

### 项目启动

接下来，在项目根目录运行前端应用：

```sh

# 安装依赖
yarn

# [首次运行或依赖更新后] 生成原生项目文件
# 这会根据 app.json 中的配置修改原生代码以支持 TV
yarn prebuild-tv

# 运行在 Apple TV 模拟器或真机上
yarn ios-tv

# 运行在 Android TV 模拟器或真机上
yarn android-tv
```

## 使用

- 1.2.x 以上版本需配合 [MoonTV](https://github.com/senshinya/MoonTV) 使用。


## 📜 主要脚本

- `yarn start`: 在手机模式下启动 Metro Bundler。
- `yarn start-tv`: 在 TV 模式下启动 Metro Bundler。
- `yarn ios-tv`: 在 Apple TV 上构建并运行应用。
- `yarn android-tv`: 在 Android TV 上构建并运行应用。
- `yarn prebuild-tv`: 为 TV 构建生成原生项目文件。
- `yarn lint`: 检查代码风格

## 📝 License

本项目采用 MIT 许可证。

## ⚠️ 免责声明

OrionTV 仅作为视频搜索工具，不存储、上传或分发任何视频内容。所有视频均来自第三方 API 接口提供的搜索结果。如有侵权内容，请联系相应的内容提供方。

本项目开发者不对使用本项目产生的任何后果负责。使用本项目时，您必须遵守当地的法律法规。

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=zimplexing/OrionTV&type=Date)](https://www.star-history.com/#zimplexing/OrionTV&Date)

## 🙏 致谢

本项目受到以下开源项目的启发：

- [MoonTV](https://github.com/senshinya/MoonTV) - 一个基于 Next.js 的视频聚合应用
- [LibreTV](https://github.com/LibreSpark/LibreTV) - 一个开源的视频流媒体应用

感谢以下项目提供 API Key 的赞助

- [gpt-load](https://github.com/tbphp/gpt-load) - 一个高性能的 OpenAI 格式 API 多密钥轮询代理服务器，支持负载均衡，使用 Go 语言开发
