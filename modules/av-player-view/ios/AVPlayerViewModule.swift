import ExpoModulesCore
import AVKit

/// 全屏呈现的原生播放器控制器。
/// 全屏 + 模态，才是 AVPlayerViewController 拿完整传输条（播放/暂停、快进快退、字幕、音轨）的形态。
/// 关闭后回调 onDismiss，让 JS 侧回到详情页。
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
  private var isPresenting = false

  public func definition() -> ModuleDefinition {
    Name("AVPlayerView")

    Events("onProgress", "onStateChange", "onDismiss")

    Function("present") { (url: String, positionMs: Double) in
      // 所有 UIKit 操作必须回到主线程，否则会直接闪退
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

  // MARK: - Present / dismiss

  private func presentPlayer(url urlString: String, positionMs: Double) {
    guard let url = URL(string: urlString) else { return }

    // 已经在呈现中就先拆掉，避免重复 present 造成崩溃
    if isPresenting || controller != nil {
      dismissPlayer(animated: false, notify: false)
    }

    guard let host = topViewController() else { return }
    // 宿主控制器必须已经在 window 里，否则 present 无响应
    guard host.view.window != nil else { return }

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

    host.present(vc, animated: true) { [weak self] in
      self?.isPresenting = false
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

  // MARK: - Helpers

  private func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap { $0.windows }.first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first
    var current = window?.rootViewController
    while let presented = current?.presentedViewController {
      current = presented
    }
    return current
  }
}
