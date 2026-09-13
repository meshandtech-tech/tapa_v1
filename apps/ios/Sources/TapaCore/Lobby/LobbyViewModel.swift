import Foundation
import Observation

@MainActor
@Observable
public final class LobbyViewModel {
    public enum ViewState: Equatable, Sendable {
        case idle
        case connecting
        case joined
        case failed(String)
    }

    public enum ConnectionState: Equatable, Sendable {
        case idle
        case connected
        case reconnecting
    }

    public var pin = ""
    public var nickname = ""
    public private(set) var state: ViewState = .idle
    public private(set) var connectionState: ConnectionState = .idle
    public private(set) var lastConnectionError: String?
    public private(set) var snapshot: RoomSnapshot?

    @ObservationIgnored private let service: any RoomService
    @ObservationIgnored private let reconnectDelay: @Sendable (Int) async -> Void
    @ObservationIgnored private var observationTask: Task<Void, Never>?
    @ObservationIgnored private var roomID: String?

    public init(service: any RoomService) {
        self.service = service
        reconnectDelay = { attempt in
            let seconds = min(1 << min(max(attempt - 1, 0), 3), 5)
            try? await Task.sleep(for: .seconds(seconds))
        }
    }

    init(
        service: any RoomService,
        reconnectDelay: @escaping @Sendable (Int) async -> Void
    ) {
        self.service = service
        self.reconnectDelay = reconnectDelay
    }

    public var canJoin: Bool {
        normalizedPIN.count == 4
            && !nickname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && state != .connecting
    }

    public var isHost: Bool {
        guard let snapshot else { return false }
        return snapshot.me.playerId == snapshot.room.hostPlayerId
    }

    public func join() async {
        guard canJoin else { return }
        state = .connecting
        connectionState = .reconnecting
        lastConnectionError = nil

        do {
            try await service.prepareSession()
            let resolution = try await service.resolveRoom(pin: normalizedPIN)
            guard resolution.status == .open, let roomID = resolution.roomID else {
                switch resolution.status {
                case .roomNotFound: throw RoomServiceError.roomNotFound
                case .roomClosed: throw RoomServiceError.roomClosed
                case .roomExpired: throw RoomServiceError.roomExpired
                case .invalidPIN: throw RoomServiceError.invalidPIN
                case .authError: throw RoomServiceError.authentication
                case .open: throw RoomServiceError.roomNotFound
                }
            }

            let result = try await service.joinRoom(
                pin: normalizedPIN,
                nickname: nickname.trimmingCharacters(in: .whitespacesAndNewlines),
                color: Self.playerColors.randomElement() ?? "#ff5c8a",
                avatarSeed: UUID().uuidString.lowercased()
            )
            if let message = result.error {
                throw RoomServiceError.rejected(message)
            }

            self.roomID = result.roomID ?? roomID
            try await refresh()
            state = .joined
            observeRoom()
        } catch {
            connectionState = .idle
            state = .failed(error.localizedDescription)
        }
    }

    public func retry() async {
        await join()
    }

    public func stop() {
        observationTask?.cancel()
        observationTask = nil
        connectionState = .idle
        Task { await service.stopObserving() }
    }

    /// Called when the app becomes active. The snapshot is refreshed before
    /// Realtime is subscribed again so background gaps never become game state.
    public func resume() async {
        guard state == .joined, roomID != nil else { return }

        let previousTask = observationTask
        observationTask = nil
        previousTask?.cancel()
        await previousTask?.value
        await service.stopObserving()

        connectionState = .reconnecting
        do {
            try await service.prepareSession()
            try await refresh()
            lastConnectionError = nil
        } catch {
            lastConnectionError = error.localizedDescription
        }
        observeRoom()
    }

    private var normalizedPIN: String {
        String(pin.filter(\.isNumber).prefix(4))
    }

    private func refresh() async throws {
        guard let roomID else { return }
        snapshot = try await service.snapshot(roomID: roomID)
    }

    private func observeRoom() {
        observationTask?.cancel()
        guard let roomID else { return }
        connectionState = .reconnecting
        let reconnectDelay = reconnectDelay

        observationTask = Task { [weak self, service] in
            var attempt = 0

            while !Task.isCancelled {
                do {
                    let events = try await service.roomChanges(roomID: roomID)

                    eventLoop: for await event in events {
                        guard !Task.isCancelled, let self else { break eventLoop }

                        switch event {
                        case .connected, .changed:
                            do {
                                try await self.refresh()
                                self.connectionState = .connected
                                self.lastConnectionError = nil
                                attempt = 0
                            } catch {
                                self.connectionState = .reconnecting
                                self.lastConnectionError = error.localizedDescription
                                break eventLoop
                            }
                        case .disconnected:
                            self.connectionState = .reconnecting
                            break eventLoop
                        }
                    }
                } catch {
                    guard !Task.isCancelled, let self else { break }
                    self.connectionState = .reconnecting
                    self.lastConnectionError = error.localizedDescription
                }

                await service.stopObserving()
                guard !Task.isCancelled else { break }

                attempt += 1
                await reconnectDelay(attempt)
            }
        }
    }

    private static let playerColors = [
        "#ff5c8a", "#ffb703", "#3ddc97", "#4cc9f0", "#b892ff",
        "#ff8c42", "#06d6a0", "#ef476f", "#8ecae6", "#c9ff4c",
    ]
}
