import Foundation
import SwiftUI

private extension PhoneCameraControlChannels {
    init?(dictionary: [String: Any]) {
        guard let truck = dictionary["truck"] as? Bool,
              let pedestal = dictionary["pedestal"] as? Bool,
              let dolly = dictionary["dolly"] as? Bool,
              let pan = dictionary["pan"] as? Bool,
              let tilt = dictionary["tilt"] as? Bool,
              let dutch = dictionary["dutch"] as? Bool else { return nil }
        self.init(truck: truck, pedestal: pedestal, dolly: dolly, pan: pan, tilt: tilt, dutch: dutch)
    }
}

enum PhoneCameraPreset: String, CaseIterable, Identifiable {
    case move = "Move"
    case rotate = "Rotate"
    case full = "Full"
    case custom = "Custom"

    var id: String { rawValue }
}

@MainActor
final class PhoneCameraViewModel: ObservableObject {
    private static let legacyControlModeKey = "NDPhoneCamera.controlMode"
    private static let controlChannelsKey = "NDPhoneCamera.controlChannels"
    private static let movementScaleKey = "NDPhoneCamera.movementScale"
    private static let rotationSensitivityKey = "NDPhoneCamera.rotationSensitivity"

    @Published var pairingText = ""
    @Published private(set) var controlChannels: PhoneCameraControlChannels
    @Published private(set) var movementScale: Double
    @Published private(set) var rotationSensitivity: Double
    @Published private(set) var connectionState: PhoneCameraTransport.Status = .disconnected
    @Published private(set) var trackingState: ARPoseTracker.TrackingState = .unavailable
    @Published private(set) var requiresRecenter = true
    @Published private(set) var hasValidPose = false
    @Published private(set) var isRecenterHolding = false
    @Published private(set) var statusMessage = "Paste a pairing link from the desktop app."
#if DEBUG
    @Published private(set) var posesSent = 0
    @Published private(set) var lastPoseTimestamp: Date?
#endif

    let transport = PhoneCameraTransport()
    let tracker = ARPoseTracker()

    private var lastSentAt: TimeInterval = 0
    private var pausedForTracking = true
    private var awaitingRecenterAck = false
#if DEBUG
    private var diagnosticsWindowStartedAt = Date().timeIntervalSince1970
    private var diagnosticsPoseCount = 0
#endif

    var selectedPreset: PhoneCameraPreset {
        if controlChannels == .move { return .move }
        if controlChannels == .rotate { return .rotate }
        if controlChannels == .full { return .full }
        return .custom
    }

    var canRecenter: Bool { connectionState == .connected && trackingState == .ready && hasValidPose && !awaitingRecenterAck }

    var canDisconnect: Bool {
        connectionState == .connected || connectionState == .connecting || (connectionState == .error && transport.hasActiveSession)
    }

    var movementScaleSliderValue: Double {
        let minimum = log(0.1)
        return (log(max(0.1, movementScale)) - minimum) / (log(10) - minimum)
    }

    init() {
        controlChannels = Self.loadChannels()
        movementScale = min(10, max(0.1, UserDefaults.standard.object(forKey: Self.movementScaleKey) as? Double ?? 1))
        rotationSensitivity = min(3, max(0.25, UserDefaults.standard.object(forKey: Self.rotationSensitivityKey) as? Double ?? 1))
        connectionState = transport.status
        trackingState = tracker.trackingState
        requiresRecenter = tracker.requiresRecenter
        transport.onStateChange = { [weak self] status, message in
            guard let self else { return }
            self.connectionState = status
            self.statusMessage = message
        }
        transport.onCommand = { [weak self] type, object in
            guard let self else { return }
            if type == "paired" {
                self.statusMessage = "Connected. Start tracking when ready."
            }
            if type == "controlState" {
                self.applyAuthoritativeControlState(object)
            }
            if type == "recenterAck" {
                self.handleRecenterAck(object)
            }
            if type == "recenterHoldState" {
                self.handleRecenterHoldState(object)
            }
            if type == "recenter" {
                self.tracker.allowAfterRecenter()
                self.pausedForTracking = false
                self.awaitingRecenterAck = false
                self.statusMessage = "Ready. Hold Recenter to reposition."
            }
        }
        tracker.onStateChange = { [weak self] state, hasPose, requiresRecenter in
            guard let self else { return }
            self.trackingState = state
            self.hasValidPose = hasPose
            self.requiresRecenter = requiresRecenter
        }
        tracker.onPose = { [weak self] pose in self?.send(pose) }
    }

    func connect() {
        guard let pairing = PhoneCameraPairing(pairingURLString: pairingText) else {
            connectionState = .error
            statusMessage = "Invalid pairing link."
            return
        }
        pausedForTracking = true
        awaitingRecenterAck = false
        transport.connect(pairing: pairing)
        tracker.start()
    }

    func beginRecenterHold() {
        guard canRecenter, !isRecenterHolding else { return }
        isRecenterHolding = true
        awaitingRecenterAck = false
        transport.sendRecenterHoldStart()
        statusMessage = "Repositioning…"
    }

    func endRecenterHold() {
        guard isRecenterHolding, !awaitingRecenterAck else { return }
        awaitingRecenterAck = true
        transport.sendRecenterHoldEnd()
        statusMessage = "Releasing Recenter…"
    }

    func setPreset(_ preset: PhoneCameraPreset) {
        guard preset != .custom else { return }
        setControlChannels(preset == .move ? .move : preset == .rotate ? .rotate : .full)
    }

    func setChannel(_ keyPath: WritableKeyPath<PhoneCameraControlChannels, Bool>) {
        var next = controlChannels
        next[keyPath: keyPath].toggle()
        setControlChannels(next)
    }

    func setControlChannels(_ channels: PhoneCameraControlChannels) {
        controlChannels = channels
        persistChannels()
        transport.sendControlChannels(channels)
        statusMessage = "Camera controls updated."
    }

    func setMovementScaleSlider(_ value: Double) { setMovementScale(exp(log(0.1) + min(1, max(0, value)) * (log(10) - log(0.1)))) }

    func setMovementScale(_ value: Double) {
        movementScale = min(10, max(0.1, value.isFinite ? value : 1))
        UserDefaults.standard.set(movementScale, forKey: Self.movementScaleKey)
        transport.sendScale(movementScale)
    }

    func setRotationSensitivity(_ value: Double) {
        rotationSensitivity = min(3, max(0.25, value.isFinite ? value : 1))
        UserDefaults.standard.set(rotationSensitivity, forKey: Self.rotationSensitivityKey)
        transport.sendRotationSensitivity(rotationSensitivity)
    }

    func disconnect() {
        tracker.stop()
        transport.disconnect()
        pausedForTracking = true
        awaitingRecenterAck = false
        isRecenterHolding = false
    }

    private func applyAuthoritativeControlState(_ object: [String: Any]) {
        guard let state = object["state"] as? [String: Any],
              let channelsObject = state["channels"] as? [String: Any],
              let channels = PhoneCameraControlChannels(dictionary: channelsObject),
              let movementScaleValue = state["movementScale"] as? NSNumber,
              let rotationSensitivityValue = state["rotationSensitivity"] as? NSNumber else { return }
        controlChannels = channels
        movementScale = min(10, max(0.1, movementScaleValue.doubleValue))
        rotationSensitivity = min(3, max(0.25, rotationSensitivityValue.doubleValue))
        persistChannels()
        UserDefaults.standard.set(self.movementScale, forKey: Self.movementScaleKey)
        UserDefaults.standard.set(self.rotationSensitivity, forKey: Self.rotationSensitivityKey)
        statusMessage = "Camera controls synchronized from the desktop."
    }

    private func handleRecenterAck(_ object: [String: Any]) {
        let accepted = object["accepted"] as? Bool ?? false
        awaitingRecenterAck = false
        isRecenterHolding = false
        if accepted {
            tracker.allowAfterRecenter()
            pausedForTracking = false
            lastSentAt = 0
            statusMessage = "Ready. Hold Recenter to reposition."
        } else {
            pausedForTracking = false
            statusMessage = (object["message"] as? String) ?? "The desktop could not recenter the Camera."
        }
    }

    private func handleRecenterHoldState(_ object: [String: Any]) {
        let accepted = object["accepted"] as? Bool ?? false
        let active = object["active"] as? Bool ?? false
        guard accepted else {
            isRecenterHolding = false
            statusMessage = (object["message"] as? String) ?? "Recenter hold was not accepted."
            return
        }
        isRecenterHolding = active
        if active {
            statusMessage = "Repositioning…"
        }
    }

    private func persistChannels() {
        if let data = try? JSONEncoder().encode(controlChannels) { UserDefaults.standard.set(data, forKey: Self.controlChannelsKey) }
    }

    private static func loadChannels() -> PhoneCameraControlChannels {
        if let data = UserDefaults.standard.data(forKey: controlChannelsKey), let channels = try? JSONDecoder().decode(PhoneCameraControlChannels.self, from: data) { return channels }
        switch UserDefaults.standard.string(forKey: legacyControlModeKey).flatMap(PhoneCameraControlMode.init(rawValue:)) {
        case .rotation: return .rotate
        case .position: return .move
        case .positionRotation: return .full
        case nil: return .full
        }
    }

    private func send(_ pose: NDPhonePose) {
        guard connectionState == .connected, trackingState == .ready, (!pausedForTracking || isRecenterHolding) else { return }
        let now = Date().timeIntervalSince1970
        guard now - lastSentAt >= (1.0 / 30.0) else { return }
        lastSentAt = now
        transport.sendPose(position: pose.position, orientation: pose.orientation)
#if DEBUG
        diagnosticsPoseCount += 1
        let now = Date().timeIntervalSince1970
        if now - diagnosticsWindowStartedAt >= 1 {
            posesSent = diagnosticsPoseCount
            lastPoseTimestamp = Date()
            debugLog("Diagnostics: nativePoseSendHz=\(String(format: "%.1f", Double(diagnosticsPoseCount) / (now - diagnosticsWindowStartedAt))) tracking=\(trackingState.rawValue) connection=\(connectionState.rawValue) mainActor=bounded")
            diagnosticsWindowStartedAt = now
            diagnosticsPoseCount = 0
        }
        assert(connectionState == .connected && trackingState == .ready, "Pose packets must only be sent while the UI reports a live connection and ready tracking.")
#endif
    }
}
