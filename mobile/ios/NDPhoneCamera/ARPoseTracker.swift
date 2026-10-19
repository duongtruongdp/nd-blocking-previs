import ARKit
import Foundation

@MainActor
final class ARPoseTracker: NSObject, ObservableObject, ARSessionDelegate {
    enum TrackingState: String {
        case ready = "Tracking ready"
        case limited = "Tracking paused — move slowly, then Recenter"
        case unavailable = "Tracking unavailable"
    }

    @Published private(set) var trackingState: TrackingState = .unavailable
    @Published private(set) var requiresRecenter = true
    private(set) var latestPose: NDPhonePose?
    private(set) var hasNormalTracking = false
    var onPose: ((NDPhonePose) -> Void)?
    var onStateChange: ((TrackingState, Bool, Bool) -> Void)?

    let session = ARSession()

    private var lastPublishedState: TrackingState = .unavailable
    private var lastPublishedHasPose = false
    private var lastPublishedRequiresRecenter = true
#if DEBUG
    private var diagnosticsWindowStartedAt = Date().timeIntervalSince1970
    private var diagnosticsFrameCount = 0
    private var diagnosticsReadyFrameCount = 0
#endif

    override init() {
        super.init()
        session.delegate = self
    }

    func start() {
        guard ARWorldTrackingConfiguration.isSupported else {
            setTrackingState(.unavailable)
            return
        }
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravity
        hasNormalTracking = false
        requiresRecenter = true
        latestPose = nil
        notifyState(force: true)
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    func stop() {
        session.pause()
        latestPose = nil
        hasNormalTracking = false
        requiresRecenter = true
        setTrackingState(.unavailable)
        notifyState(force: true)
    }

    func allowAfterRecenter() {
        guard hasNormalTracking else { return }
        requiresRecenter = false
        notifyState()
    }

    func requireRecenter() {
        requiresRecenter = true
        notifyState()
    }

    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let state: TrackingState
        switch frame.camera.trackingState {
        case .normal:
            state = .ready
        case .limited:
            state = .limited
        case .notAvailable:
            state = .unavailable
        @unknown default:
            state = .unavailable
        }
        let pose = state == .ready ? NDPhonePoseMath.pose(from: frame.camera.transform) : nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            #if DEBUG
            self.diagnosticsFrameCount += 1
            if state == .ready { self.diagnosticsReadyFrameCount += 1 }
            self.emitDiagnosticsIfNeeded()
            #endif
            self.setTrackingState(state)
            if state != .ready {
                self.hasNormalTracking = false
                self.latestPose = nil
                self.requiresRecenter = true
                self.notifyState()
                return
            }
            self.hasNormalTracking = true
            self.latestPose = pose
            self.notifyState()
            guard let pose, !self.requiresRecenter else { return }
            self.onPose?(pose)
        }
    }

    private func setTrackingState(_ state: TrackingState) {
        if trackingState != state { trackingState = state }
    }

    private func notifyState(force: Bool = false) {
        guard force || trackingState != lastPublishedState || (latestPose != nil) != lastPublishedHasPose || requiresRecenter != lastPublishedRequiresRecenter else { return }
        lastPublishedState = trackingState
        lastPublishedHasPose = latestPose != nil
        lastPublishedRequiresRecenter = requiresRecenter
        onStateChange?(trackingState, latestPose != nil, requiresRecenter)
    }

#if DEBUG
    private func emitDiagnosticsIfNeeded() {
        let now = Date().timeIntervalSince1970
        let elapsed = now - diagnosticsWindowStartedAt
        guard elapsed >= 1 else { return }
        debugLog("Diagnostics: arFrameHz=\(String(format: "%.1f", Double(diagnosticsFrameCount) / elapsed)) nativeReadyPoseHz=\(String(format: "%.1f", Double(diagnosticsReadyFrameCount) / elapsed)) tracking=\(trackingState.rawValue) hasPose=\(latestPose != nil)")
        diagnosticsWindowStartedAt = now
        diagnosticsFrameCount = 0
        diagnosticsReadyFrameCount = 0
    }
#endif
}
