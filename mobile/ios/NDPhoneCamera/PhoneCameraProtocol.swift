import Foundation
import Combine

struct PhoneCameraPairing {
    let session: String
    let token: String
    let relay: URL

    init?(pairingURLString: String) {
        guard let url = URL(string: pairingURLString),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let session = components.queryItems?.first(where: { $0.name == "session" })?.value,
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
              let relayValue = components.queryItems?.first(where: { $0.name == "relay" })?.value,
              let relay = URL(string: relayValue),
              !session.isEmpty, !token.isEmpty,
              relay.scheme?.lowercased() == "wss",
              relay.host?.isEmpty == false,
              relay.path == "/session" else { return nil }
        self.session = session
        self.token = token
        self.relay = relay
    }

    var socketURL: URL? {
        guard var components = URLComponents(url: relay, resolvingAgainstBaseURL: false), components.path == "/session" else { return nil }
        var queryItems = components.queryItems ?? []
        queryItems.removeAll { item in ["session", "token", "role"].contains(item.name) }
        queryItems.append(contentsOf: [
            URLQueryItem(name: "session", value: session),
            URLQueryItem(name: "token", value: token),
            URLQueryItem(name: "role", value: "phone"),
        ])
        components.queryItems = queryItems
        return components.url
    }
}

struct PhoneCameraCapabilities: Codable {
    let orientation: Bool
    let position: Bool
    let controlChannels: Bool
}

enum PhoneCameraControlMode: String, Codable, CaseIterable {
    case rotation
    case position
    case positionRotation
}

struct PhoneCameraControlChannels: Codable, Equatable {
    var truck: Bool
    var pedestal: Bool
    var dolly: Bool
    var pan: Bool
    var tilt: Bool
    var dutch: Bool

    static let full = PhoneCameraControlChannels(truck: true, pedestal: true, dolly: true, pan: true, tilt: true, dutch: true)
    static let move = PhoneCameraControlChannels(truck: true, pedestal: true, dolly: true, pan: false, tilt: false, dutch: false)
    static let rotate = PhoneCameraControlChannels(truck: false, pedestal: false, dolly: false, pan: true, tilt: true, dutch: true)
}

struct PhoneCameraHello: Codable {
    let v: Int
    let type: String
    let role: String
    let session: String
    let capabilities: PhoneCameraCapabilities
}

struct PhoneCameraReady: Codable {
    let v: Int
    let type: String
    let session: String
    let device: String
    let capabilities: PhoneCameraCapabilities
}

struct PhoneCameraPose: Codable {
    let v: Int
    let type: String
    let session: String
    let t: Int64
    let orientation: [Float]
    let position: [Float]
    let screenOrientation: String
}

struct PhoneCameraCommand: Codable {
    let v: Int
    let type: String
    let session: String
}

struct PhoneCameraScaleCommand: Codable {
    let v: Int
    let type: String
    let session: String
    let scale: Double
}

struct PhoneCameraControlModeCommand: Codable {
    let v: Int
    let type: String
    let session: String
    let mode: PhoneCameraControlMode
}

struct PhoneCameraControlChannelsCommand: Codable {
    let v: Int
    let type: String
    let session: String
    let channels: PhoneCameraControlChannels
}

struct PhoneCameraRotationSensitivityCommand: Codable {
    let v: Int
    let type: String
    let session: String
    let sensitivity: Double
}

enum PhoneCameraOutboundMessage {
    case hello(PhoneCameraHello)
    case ready(PhoneCameraReady)
    case pose(PhoneCameraPose)
    case command(PhoneCameraCommand)
    case scale(PhoneCameraScaleCommand)
    case rotationSensitivity(PhoneCameraRotationSensitivityCommand)
    case controlChannels(PhoneCameraControlChannelsCommand)
    case controlMode(PhoneCameraControlModeCommand)

    var data: Data? {
        let encoder = JSONEncoder()
        switch self {
        case .hello(let message): return try? encoder.encode(message)
        case .ready(let message): return try? encoder.encode(message)
        case .pose(let message): return try? encoder.encode(message)
        case .command(let message): return try? encoder.encode(message)
        case .scale(let message): return try? encoder.encode(message)
        case .rotationSensitivity(let message): return try? encoder.encode(message)
        case .controlChannels(let message): return try? encoder.encode(message)
        case .controlMode(let message): return try? encoder.encode(message)
        }
    }
}

@MainActor
final class PhoneCameraTransport: NSObject, ObservableObject, @preconcurrency URLSessionWebSocketDelegate {
    enum Status: String {
        case disconnected = "Disconnected"
        case connecting = "Connecting"
        case connected = "Connected"
        case error = "Connection error"
    }

    @Published var status: Status = .disconnected
    @Published var message = "Paste a pairing link from the desktop app."
    var onCommand: ((String, [String: Any]) -> Void)?
    var onStateChange: ((Status, String) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var pairing: PhoneCameraPairing?
    private var generation = 0
    private var handshakeTimer: DispatchWorkItem?
    private var socketIsOpen = false
    private let handshakeTimeout: TimeInterval = 10
    private var pendingPose: PhoneCameraPose?
    private var poseSendInFlight = false

    func connect(pairing: PhoneCameraPairing) {
        disconnect()
        guard let socketURL = pairing.socketURL else {
            updateState(.error, message: "The pairing relay address is invalid.")
            return
        }
        self.pairing = pairing
        updateState(.connecting, message: "Connecting to the desktop…")
        socketIsOpen = false
        debugLog("Build: 6DOF-V1C")
        debugLog("State: Connecting")
        debugLog("Connecting \(relayDescription(socketURL)) session …\(pairing.session.suffix(6))")
        generation += 1
        let currentGeneration = generation
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue.main)
        urlSession = session
        let socket = session.webSocketTask(with: socketURL)
        task = socket
        socket.resume()
        receiveNext(socket: socket, generation: currentGeneration)
        let timeout = DispatchWorkItem { [weak self, weak socket] in
            guard let self, let socket,
                  self.generation == currentGeneration,
                  self.task === socket,
                  self.status == .connecting else { return }
            debugLog("Handshake timeout after \(self.handshakeTimeout)s")
            self.failCurrentConnection("Phone Camera handshake timed out.")
        }
        handshakeTimer = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + handshakeTimeout, execute: timeout)
    }

    func sendReady() {
        guard let pairing else { return }
        send(.ready(PhoneCameraReady(v: 1, type: "ready", session: pairing.session, device: "NDPhoneCamera iOS", capabilities: PhoneCameraCapabilities(orientation: true, position: true, controlChannels: true))))
    }

    func sendPose(position: [Float], orientation: [Float]) {
        guard let pairing else { return }
        pendingPose = PhoneCameraPose(v: 1, type: "pose", session: pairing.session, t: Int64(Date().timeIntervalSince1970 * 1000), orientation: orientation, position: position, screenOrientation: "unknown")
        flushLatestPose()
    }

    func sendRecenter() {
        sendCommand("recenter")
    }

    func sendRecenterHoldStart() {
        sendCommand("recenterHoldStart")
    }

    func sendRecenterHoldEnd() {
        sendCommand("recenterHoldEnd")
    }

    func sendScale(_ scale: Double) {
        guard let pairing else { return }
        send(.scale(PhoneCameraScaleCommand(v: 1, type: "setMovementScale", session: pairing.session, scale: scale)))
    }

    func sendRotationSensitivity(_ sensitivity: Double) {
        guard let pairing else { return }
        send(.rotationSensitivity(PhoneCameraRotationSensitivityCommand(v: 1, type: "setRotationSensitivity", session: pairing.session, sensitivity: sensitivity)))
    }

    func sendControlChannels(_ channels: PhoneCameraControlChannels) {
        guard let pairing else { return }
        send(.controlChannels(PhoneCameraControlChannelsCommand(v: 1, type: "controlChannels", session: pairing.session, channels: channels)))
    }

    func sendControlMode(_ mode: PhoneCameraControlMode) {
        guard let pairing else { return }
        send(.controlMode(PhoneCameraControlModeCommand(v: 1, type: "controlMode", session: pairing.session, mode: mode)))
    }

    func sendCommand(_ type: String) {
        guard let pairing else { return }
        send(.command(PhoneCameraCommand(v: 1, type: type, session: pairing.session)))
    }

    func disconnect() {
        debugLog("Disconnecting")
        handshakeTimer?.cancel()
        handshakeTimer = nil
        generation += 1
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        urlSession = nil
        pairing = nil
        socketIsOpen = false
        pendingPose = nil
        poseSendInFlight = false
        updateState(.disconnected, message: "Disconnected.")
    }

    var hasActiveSession: Bool { task != nil || pairing != nil }

    func reportError(_ message: String) {
        updateState(.error, message: message)
    }

    private func send(_ outbound: PhoneCameraOutboundMessage) {
        guard let data = outbound.data, let text = String(data: data, encoding: .utf8) else { return }
        guard let task, socketIsOpen else { return }
        let currentGeneration = generation
        task.send(.string(text)) { [weak self, weak task] error in
            guard let error else { return }
            DispatchQueue.main.async { [weak self] in
                guard let self, let task, self.generation == currentGeneration, self.task === task else { return }
                debugLog("Socket send error: \(error.localizedDescription)")
                self.failCurrentConnection("The secure relay could not be reached: \(error.localizedDescription)")
            }
        }
    }

    private func flushLatestPose() {
        guard !poseSendInFlight, let pose = pendingPose, let task, socketIsOpen,
              let data = PhoneCameraOutboundMessage.pose(pose).data,
              let text = String(data: data, encoding: .utf8) else { return }
        pendingPose = nil
        poseSendInFlight = true
        let currentGeneration = generation
        task.send(.string(text)) { [weak self, weak task] error in
            DispatchQueue.main.async { [weak self] in
                guard let self, let task, self.generation == currentGeneration, self.task === task else { return }
                self.poseSendInFlight = false
                if let error {
                    debugLog("Pose send error: \(error.localizedDescription)")
                    self.failCurrentConnection("The secure relay could not be reached: \(error.localizedDescription)")
                    return
                }
                self.flushLatestPose()
            }
        }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol `protocol`: String?) {
        guard task === webSocketTask, let pairing else { return }
        socketIsOpen = true
        debugLog("Socket opened")
        send(.hello(PhoneCameraHello(v: 1, type: "hello", role: "phone", session: pairing.session, capabilities: PhoneCameraCapabilities(orientation: true, position: true, controlChannels: true))))
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        guard task === webSocketTask else { return }
        let closeReason = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "none"
        debugLog("Socket closed: code=\(closeCode.rawValue) reason=\(closeReason)")
        if status == .connecting || status == .connected {
            failCurrentConnection("Relay closed the Phone Camera connection.")
        }
    }

    private func receiveNext(socket: URLSessionWebSocketTask, generation: Int) {
        socket.receive { [weak self, weak socket] result in
            guard let self else { return }
            DispatchQueue.main.async { [weak self] in
                guard let self, let socket, self.generation == generation, self.task === socket else { return }
                switch result {
                case .success(.string(let text)):
                    self.handleIncoming(text)
                    self.receiveNext(socket: socket, generation: generation)
                case .success:
                    self.receiveNext(socket: socket, generation: generation)
                case .failure(let error):
                    debugLog("Socket receive error: \(error.localizedDescription)")
                    self.failCurrentConnection("Relay connection ended: \(error.localizedDescription)")
                }
            }
        }
    }

    private func handleIncoming(_ text: String) {
        guard let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else {
            debugLog("unsupported_message: malformed")
            return
        }
        if type != "pose" {
            debugLog("Received control: \(type)")
        }
        if type == "paired" {
            guard socketIsOpen else {
                debugLog("Ignoring paired before socket open")
                return
            }
            handshakeTimer?.cancel()
            handshakeTimer = nil
            sendReady()
            updateState(.connected, message: "Connected. Start tracking when ready.")
            debugLog("State: Connected")
        }
        if type == "ping", let pairing, let timestamp = object["t"] as? NSNumber {
            let message = PhoneCameraHeartbeat(v: 1, type: "pong", session: pairing.session, t: timestamp.int64Value)
            guard let data = try? JSONEncoder().encode(message), let text = String(data: data, encoding: .utf8) else { return }
            task?.send(.string(text), completionHandler: { _ in })
        }
        if type == "error" {
            let code = (object["code"] as? String) ?? "unknown"
            let relayMessage = (object["message"] as? String) ?? "The relay rejected this session."
            debugLog("Relay error: \(code)")
            failCurrentConnection(relayMessage)
        }
        if type == "disconnected" {
            finishDisconnected((object["reason"] as? String) ?? "Disconnected.")
        }
        if !["paired", "ping", "error", "disconnected", "ready", "controlState", "recenterAck", "recenterHoldState"].contains(type) {
            debugLog("unsupported_message: \(type)")
        }
        onCommand?(type, object)
    }

    private func failCurrentConnection(_ message: String) {
        handshakeTimer?.cancel()
        handshakeTimer = nil
        generation += 1
        task?.cancel(with: .goingAway, reason: message.data(using: .utf8))
        task = nil
        urlSession = nil
        pairing = nil
        socketIsOpen = false
        updateState(.error, message: message)
        debugLog("State: Connection error")
    }

    private func finishDisconnected(_ message: String) {
        handshakeTimer?.cancel()
        handshakeTimer = nil
        generation += 1
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        urlSession = nil
        pairing = nil
        socketIsOpen = false
        updateState(.disconnected, message: message)
        debugLog("State: Disconnected")
    }

    private func updateState(_ status: Status, message: String) {
        self.status = status
        self.message = message
        onStateChange?(status, message)
    }
}

private func relayDescription(_ url: URL) -> String {
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    components?.query = nil
    components?.fragment = nil
    return components?.string ?? "wss://invalid"
}

private func debugLog(_ message: String) {
#if DEBUG
    print("[NDPhoneCamera] \(message)")
#endif
}

private struct PhoneCameraHeartbeat: Codable {
    let v: Int
    let type: String
    let session: String
    let t: Int64
}
