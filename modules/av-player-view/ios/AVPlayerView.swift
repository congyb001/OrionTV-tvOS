import ExpoModulesCore
import AVKit

/// 把 AVPlayerViewController 作为子控制器嵌进 RN 视图。
/// 播放界面（传输条、进度、信息）全部由 tvOS 原生提供。
class AVPlayerView: ExpoView {
  let onProgress = EventDispatcher()
  let onStateChange = EventDispatcher()

  private let playerViewController = AVPlayerViewController()
  private var player: AVPlayer?
  private var timeObserverToken: Any?
  private var currentURL: String?
  private var pendingPositionMs: Double = 0
  private var pendingRate: Double = 1.0
  private var wantAutoPlay: Bool = true

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    playerViewController.view.backgroundColor = .black
    playerViewController.showsPlaybackControls = true
    playerViewController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(playerViewController.view)
  }

  // 让焦点交给上层的 RN 按钮层，播放器只负责出画面
  override var canBecomeFocused: Bool {
    false
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    playerViewController.view.frame = bounds
  }

  /// 视图挂到 window 后，把播放控制器挂到最近的 UIViewController 上，
  /// 这样 tvOS 的原生传输条和焦点行为才是正常的。
  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else { return }
    attachToParentControllerIfNeeded()
  }

  private func attachToParentControllerIfNeeded() {
    guard let parent = findViewController() else { return }
    if playerViewController.parent === parent { return }
    if playerViewController.parent != nil {
      playerViewController.willMove(toParent: nil)
      playerViewController.removeFromParent()
    }
    parent.addChild(playerViewController)
    playerViewController.didMove(toParent: parent)
  }

  private func findViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let viewController = current as? UIViewController {
        return viewController
      }
      responder = current.next
    }
    return nil
  }

  // MARK: - Props

  func load(url: String?) {
    guard let urlString = url, !urlString.isEmpty else {
      teardownPlayer()
      return
    }
    if urlString == currentURL, player != nil {
      return
    }
    currentURL = urlString

    teardownPlayer()

    guard let playbackURL = URL(string: urlString) else { return }

    let item = AVPlayerItem(url: playbackURL)
    let newPlayer = AVPlayer(playerItem: item)
    player = newPlayer
    playerViewController.player = newPlayer

    if pendingPositionMs > 0 {
      let target = CMTime(value: CMTimeValue(pendingPositionMs), timescale: 1000)
      newPlayer.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
    }
    if pendingRate != 1.0 {
      newPlayer.rate = Float(pendingRate)
    }
    if wantAutoPlay {
      newPlayer.play()
    }

    addTimeObserver(to: newPlayer)
    observeEnd(of: item)
  }

  func setInitialPosition(_ positionMs: Double) {
    pendingPositionMs = max(0, positionMs)
    guard let player = player, pendingPositionMs > 0 else { return }
    let target = CMTime(value: CMTimeValue(pendingPositionMs), timescale: 1000)
    player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
  }

  func setRate(_ rate: Double) {
    pendingRate = rate
    if #available(tvOS 16.0, iOS 16.0, *) {
      player?.defaultRate = Float(rate)
    }
    if player?.timeControlStatus == .playing {
      player?.rate = Float(rate)
    }
  }

  func setAutoPlay(_ autoPlay: Bool) {
    wantAutoPlay = autoPlay
    if autoPlay {
      player?.play()
    } else {
      player?.pause()
    }
  }

  // MARK: - Events

  private func addTimeObserver(to player: AVPlayer) {
    let interval = CMTime(seconds: 1.0, preferredTimescale: 1000)
    timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
      guard let self = self, let item = player.currentItem else { return }
      let positionMs = time.seconds.isFinite ? time.seconds * 1000 : 0
      let durationMs = item.duration.seconds.isFinite ? item.duration.seconds * 1000 : 0
      let isPlaying = player.timeControlStatus == .playing
      self.onProgress([
        "positionMillis": positionMs,
        "durationMillis": durationMs,
        "isPlaying": isPlaying,
      ])
    }
  }

  private func observeEnd(of item: AVPlayerItem) {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handlePlaybackEnd),
      name: .AVPlayerItemDidPlayToEndTime,
      object: item
    )
  }

  @objc private func handlePlaybackEnd() {
    onStateChange(["didJustFinish": true])
  }

  private func teardownPlayer() {
    NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: nil)
    if let token = timeObserverToken, let player = player {
      player.removeTimeObserver(token)
    }
    timeObserverToken = nil
    player?.pause()
    player?.replaceCurrentItem(with: nil)
    playerViewController.player = nil
    player = nil
  }

  deinit {
    teardownPlayer()
    if let parent = playerViewController.parent {
      playerViewController.willMove(toParent: nil)
      playerViewController.removeFromParent()
    }
  }
}
