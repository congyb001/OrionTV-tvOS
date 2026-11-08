#!/bin/bash
# 重新构建 OrionTV 的 Apple TV 安装包
# 用法： ./rebuild.sh        → 构建真机 ipa 到本目录
#       ./rebuild.sh sim    → 只构建 tvOS 模拟器版本
set -euo pipefail

MODE="${1:-device}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../OrionTV" && pwd)"
OUT="$ROOT"
DD="${TMPDIR:-/tmp}/orion-dd-$MODE"

if [ ! -d "$REPO/ios/OrionTV.xcworkspace" ]; then
  echo "找不到 $REPO/ios/OrionTV.xcworkspace，请先确认工程目录位置" >&2
  exit 1
fi

# 依赖有变动时先执行 pod install（没有变动可跳过）
if [ "${SKIP_POD_INSTALL:-0}" != "1" ]; then
  echo "==> pod install"
  ( cd "$REPO/ios" && pod install )
fi

cd "$REPO/ios"

if [ "$MODE" = "sim" ]; then
  echo "==> 构建 tvOS 模拟器版本"
  xcodebuild -workspace OrionTV.xcworkspace -scheme OrionTV \
    -configuration Release -sdk appletvsimulator \
    -destination 'generic/platform=tvOS Simulator' \
    -derivedDataPath "$DD" build
  echo "产物：$DD/Build/Products/Release-appletvsimulator/OrionTV.app"
  exit 0
fi

echo "==> 构建 tvOS 真机版本（不签名）"
xcodebuild -workspace OrionTV.xcworkspace -scheme OrionTV \
  -configuration Release -sdk appletvos \
  -destination 'generic/platform=tvOS' \
  -derivedDataPath "$DD" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build

APP_PATH="$DD/Build/Products/Release-appletvos/OrionTV.app"
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP_PATH/Info.plist")
IPA_NAME="OrionTV_${VERSION}_AppleTV.ipa"

echo "==> 打包 $IPA_NAME"
WORK="$(mktemp -d)"
mkdir -p "$WORK/Payload"
cp -R "$APP_PATH" "$WORK/Payload/"
( cd "$WORK" && zip -qry "$IPA_NAME" Payload )
cp "$WORK/$IPA_NAME" "$OUT/"
rm -rf "$WORK"

ls -lh "$OUT/$IPA_NAME"
echo "完成。安装前需要用 Sideloadly / Xcode 用自己的 Apple ID 签名。"
