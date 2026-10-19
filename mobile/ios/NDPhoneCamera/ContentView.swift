import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = PhoneCameraViewModel()
    @FocusState private var pairingFocused: Bool
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("ND Blocking & Previs")
                        .font(.headline)
                    Text("Phone Camera")
                        .foregroundStyle(.secondary)
                }

                if viewModel.connectionState != .connected {
                    Section("Pairing") {
                        TextField("Paste desktop pairing link", text: $viewModel.pairingText, axis: .vertical)
                            .focused($pairingFocused)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.done)
                            .onSubmit {
                                pairingFocused = false
                                viewModel.connect()
                            }
                        Button("Connect") {
                            pairingFocused = false
                            viewModel.connect()
                        }
                        .disabled(viewModel.connectionState == .connecting)
                        if viewModel.canDisconnect {
                            Button("Cancel Connection", role: .destructive) {
                                pairingFocused = false
                                viewModel.disconnect()
                            }
                        }
                    }
                }

                Section("Camera") {
                    LabeledContent("Status", value: viewModel.connectionState.rawValue)
                    LabeledContent("Tracking", value: viewModel.trackingState.rawValue)
                    if viewModel.connectionState == .connected {
                        Picker("Preset", selection: Binding(get: { viewModel.selectedPreset }, set: { viewModel.setPreset($0) })) {
                            ForEach(PhoneCameraPreset.allCases) { preset in
                                Text(preset.rawValue).tag(preset)
                            }
                        }
                        .pickerStyle(.menu)
                        Group {
                            Text("Movement")
                                .font(.subheadline.weight(.semibold))
                            HStack {
                                channelButton("Truck", active: viewModel.controlChannels.truck) { viewModel.setChannel(\.truck) }
                                channelButton("Pedestal", active: viewModel.controlChannels.pedestal) { viewModel.setChannel(\.pedestal) }
                                channelButton("Dolly", active: viewModel.controlChannels.dolly) { viewModel.setChannel(\.dolly) }
                            }
                            if viewModel.controlChannels.truck || viewModel.controlChannels.pedestal || viewModel.controlChannels.dolly {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text("Movement Scale")
                                        Spacer()
                                        Text(String(format: "%.2f×", viewModel.movementScale))
                                            .monospacedDigit()
                                            .foregroundStyle(.secondary)
                                    }
                                    Slider(value: Binding(get: { viewModel.movementScaleSliderValue }, set: { viewModel.setMovementScaleSlider($0) }), in: 0...1)
                                }
                            }
                            Text("Rotation")
                                .font(.subheadline.weight(.semibold))
                            HStack {
                                channelButton("Pan", active: viewModel.controlChannels.pan) { viewModel.setChannel(\.pan) }
                                channelButton("Tilt", active: viewModel.controlChannels.tilt) { viewModel.setChannel(\.tilt) }
                                channelButton("Dutch", active: viewModel.controlChannels.dutch) { viewModel.setChannel(\.dutch) }
                            }
                            if viewModel.controlChannels.pan || viewModel.controlChannels.tilt || viewModel.controlChannels.dutch {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text("Rotation Sensitivity")
                                        Spacer()
                                        Text(String(format: "%.2f×", viewModel.rotationSensitivity))
                                            .monospacedDigit()
                                            .foregroundStyle(.secondary)
                                    }
                                    Slider(value: Binding(get: { viewModel.rotationSensitivity }, set: { viewModel.setRotationSensitivity($0) }), in: 0.25...3, step: 0.01)
                                }
                            }
                        }
                        if viewModel.requiresRecenter {
                            Text("Recenter to continue.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        Text(viewModel.isRecenterHolding ? "Repositioning…" : "Recenter")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(viewModel.isRecenterHolding ? Color.orange : Color.accentColor, in: RoundedRectangle(cornerRadius: 8))
                            .foregroundStyle(.white)
                            .contentShape(Rectangle())
                            .accessibilityAddTraits(.isButton)
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { _ in viewModel.beginRecenterHold() }
                                    .onEnded { _ in viewModel.endRecenterHold() }
                            )
                            .opacity(viewModel.canRecenter || viewModel.isRecenterHolding ? 1 : 0.45)
                            .allowsHitTesting(viewModel.canRecenter || viewModel.isRecenterHolding)
                        if !viewModel.isRecenterHolding {
                            Text("Hold to reposition")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                        Button("Disconnect", role: .destructive) {
                            pairingFocused = false
                            viewModel.disconnect()
                        }
                        .disabled(!viewModel.canDisconnect)
                    }
                }

                Section {
                    Text(viewModel.statusMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text("Move the phone slowly. The desktop Camera pauses after tracking loss until you Recenter.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Phone Camera")
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { pairingFocused = false }
                }
            }
            .onChange(of: scenePhase) { phase in
                if phase != .active, viewModel.isRecenterHolding { viewModel.endRecenterHold() }
            }
            .onDisappear {
                if viewModel.isRecenterHolding { viewModel.endRecenterHold() }
            }
        }
    }

    private func channelButton(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.borderedProminent)
            .tint(active ? .accentColor : .gray.opacity(0.35))
            .controlSize(.small)
    }
}
