import ExpoModulesCore
import AVKit
import UIKit

/// 全屏呈现的原生播放器控制器。
/// 只有全屏模态形态，AVPlayerViewController 才会给出完整传输条（播放/暂停、±10 秒、字幕、音轨）。
/// 被关闭（遥控 Menu）时回调 onDismiss，让 JS 侧回到详情页。
final class OrionPlayerViewController: AVPlayerViewController {
  var onDismiss: (() -> Void)?
  private var alreadyReported = false

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    guard !alreadyReported else { return }
    if presentingViewController == nil || isBeingDismissed {
      alreadyReported = true
      onDismiss?()
    }
  }
}

public class AVPlayerViewModule: Module {
  private var controller: OrionPlayerViewController?
  private var player: AVPlayer?
  private var timeObserverToken: Any?
  private var endObserver: NSObjectProtocol?
  private var statusObservation: NSKeyValueObservation?
  private var isPresenting = false
  private var retryCount = 0
  private var pendingURL: String?
  private var pendingPositionMs: Double = 0

  public func definition() -> ModuleDefinition {
    Name("AVPlayerView")

    Events("onProgress", "onStateChange", "onDismiss", "onError")

    Function("present") { (url: String, positionMs: Double) in
      self.pendingURL = url
      self.pendingPositionMs = positionMs
      self.retryCount = 0
      // UIKit 必须在主线程操作，否则会直接闪退
      DispatchQueue.main.async {
        self.presentPlayer(url: url, positionMs: positionMs)
      }
    }

    Function("dismiss") {
      DispatchQueue.main.async {
        self.dismissPlayer(animated: true, notify: false)
      }
    }

    Function("isPresenting") { () -> Bool in
      return self.controller?.presentingViewController != nil
    }

    OnDestroy {
      DispatchQueue.main.async {
        self.dismissPlayer(animated: false, notify: false)
      }
    }
  }

  // MARK: - Present

  private func presentPlayer(url urlString: String, positionMs: Double) {
    guard let url = URL(string: urlString) else {
      sendEvent("onError", ["message": "片源地址无效"])
      return
    }

    // 已有一个在呈现，先收掉，避免重复 present 崩溃
    if controller != nil {
      dismissPlayer(animated: false, notify: false)
    }

    guard let host = topViewController() else {
      scheduleRetry(reason: "尚未找到可用的宿主控制器")
      return
    }
    guard host.view.window != nil else {
      scheduleRetry(reason: "宿主页面还没挂到窗口上")
      return
    }

    let item = AVPlayerItem(url: url)
    let newPlayer = AVPlayer(playerItem: item)
    player = newPlayer

    let vc = OrionPlayerViewController()
    vc.player = newPlayer
    vc.showsPlaybackControls = true
    vc.modalPresentationStyle = .fullScreen
    vc.view.backgroundColor = .black
    vc.onDismiss = { [weak self] in
      self?.cleanupPlayer()
      self?.sendEvent("onDismiss", [:])
    }
    controller = vc
    isPresenting = true

    if positionMs > 0 {
      let target = CMTime(value: CMTimeValue(positionMs), timescale: 1000)
      newPlayer.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    host.present(vc, animated: true) { [weak self, weak vc] in
      guard let self = self else { return }
      self.isPresenting = false
      // 呈现没生效时给出明确原因，别让用户只看到转圈
      if vc?.presentingViewController == nil {
        self.sendEvent("onError", ["message": "原生播放器未能呈现（present 未生效）"])
        self.cleanupPlayer()
        self.controller = nil
      }
    }

    statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      if item.status == .failed {
        let reason = item.error?.localizedDescription ?? "未知错误"
        self?.sendEvent("onError", ["message": "播放失败：\(reason)"])
      }
    }

    newPlayer.play()
    addTimeObserver(to: newPlayer)

    endObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: item,
      queue: .main
    ) { [weak self] _ in
      self?.sendEvent("onStateChange", ["didJustFinish": true])
    }
  }

  private func scheduleRetry(reason: String) {
    guard retryCount < 10 else {
      retryCount = 0
      sendEvent("onError", ["message": "画面没能起来：\(reason)"])
      return
    }
    retryCount += 1
    guard let url = pendingURL else { return }
    let position = pendingPositionMs
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
      self?.presentPlayer(url: url, positionMs: position)
    }
  }

  // MARK: - Dismiss / cleanup

  private func dismissPlayer(animated: Bool, notify: Bool) {
    guard let vc = controller else {
      cleanupPlayer()
      return
    }
    controller = nil
    isPresenting = false
    if notify {
      sendEvent("onDismiss", [:])
    }
    if vc.presentingViewController != nil {
      vc.dismiss(animated: animated)
    }
    cleanupPlayer()
  }

  private func cleanupPlayer() {
    if let token = timeObserverToken, let player = player {
      player.removeTimeObserver(token)
    }
    timeObserverToken = nil
    if let endObserver = endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    endObserver = nil
    statusObservation?.invalidate()
    statusObservation = nil
    player?.pause()
    player?.replaceCurrentItem(with: nil)
    player = nil
  }

  // MARK: - Progress

  private func addTimeObserver(to player: AVPlayer) {
    let interval = CMTime(seconds: 1.0, preferredTimescale: 1000)
    timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
      guard let self = self, let item = player.currentItem else { return }
      let positionSeconds = time.seconds
      let durationSeconds = item.duration.seconds
      self.sendEvent("onProgress", [
        "positionMillis": positionSeconds.isFinite ? positionSeconds * 1000 : 0,
        "durationMillis": durationSeconds.isFinite ? durationSeconds * 1000 : 0,
        "isPlaying": player.timeControlStatus == .playing,
      ])
    }
  }

  // MARK: - Host controller lookup

  private func topViewController() -> UIViewController? {
    // 1) Expo 提供的当前控制器
    if let vc = self.appContext?.utilities?.currentViewController() {
      return topMost(from: vc)
    }
    // 2) 场景里的窗口
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap { $0.windows }
    if let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first,
       let root = window.rootViewController {
      return topMost(from: root)
    }
    // 3) AppDelegate 的 window
    if let root = UIApplication.shared.delegate?.window??.rootViewController {
      return topMost(from: root)
    }
    return nil
  }

  private func topMost(from controller: UIViewController) -> UIViewController {
    var current = controller
    while let presented = current.presentedViewController {
      current = presented
    }
    return current
  }
}
