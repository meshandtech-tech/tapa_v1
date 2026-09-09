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

    public var pin = ""
    public var nickname = ""
    public private(set) var state: ViewState = .idle
    public private(set) var snapshot: RoomSnapshot?

    @ObservationIgnored private let service: any RoomService
    @ObservationIgnored private var observationTask: Task<Void, Never>?
    @ObservationIgnored private var roomID: String?

    public init(service: any RoomService) {
        self.service = service
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
            state = .failed(error.localizedDescription)
        }
    }

    public func retry() async {
        await join()
    }

    public func stop() {
        observationTask?.cancel()
        observationTask = nil
        Task { await service.stopObserving() }
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

        observationTask = Task { [weak self, service] in
            do {
                let changes = try await service.roomChanges(roomID: roomID)
                for await _ in changes {
                    guard !Task.isCancelled, let self else { break }
                    try await self.refresh()
                }
            } catch {
                guard !Task.isCancelled, let self else { return }
                self.state = .failed(error.localizedDescription)
            }
        }
    }

    private static let playerColors = [
        "#ff5c8a", "#ffb703", "#3ddc97", "#4cc9f0", "#b892ff",
        "#ff8c42", "#06d6a0", "#ef476f", "#8ecae6", "#c9ff4c",
    ]
}
