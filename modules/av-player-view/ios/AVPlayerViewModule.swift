import ExpoModulesCore
import AVKit

public class AVPlayerViewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AVPlayerView")

    View(AVPlayerView.self) {
      Prop("url") { (view: AVPlayerView, url: String?) in
        view.load(url: url)
      }
      Prop("initialPositionMs") { (view: AVPlayerView, positionMs: Double) in
        view.setInitialPosition(positionMs)
      }
      Prop("rate") { (view: AVPlayerView, rate: Double) in
        view.setRate(rate)
      }
      Prop("autoPlay") { (view: AVPlayerView, autoPlay: Bool) in
        view.setAutoPlay(autoPlay)
      }

      Events("onProgress", "onStateChange")
    }
  }
}
