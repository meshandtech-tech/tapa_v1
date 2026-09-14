import Foundation

public enum GameDifficulty: String, Codable, CaseIterable, Sendable {
    case easy
    case medium
    case hard
}

public struct StartMatchPrompt: Codable, Equatable, Sendable {
    public let id: String
    public let text: String
    public let acceptedAnswers: [String]
}

public struct StartMatchTopic: Codable, Equatable, Sendable {
    public let id: String
    public let source: String
    public let text: String
}

public struct StartMatchPayload: Equatable, Sendable {
    public let prompts: [StartMatchPrompt]
    public let topics: [StartMatchTopic]
    public let questionOrder: [Int]
    public let correctOptions: [Int]
    public let slideIDs: [String]
    public let punishmentCount: Int
}

public struct HostGameCatalog: Decodable, Sendable {
    public struct DrawingPrompt: Decodable, Sendable {
        public let id: String
        public let text: String
        public let acceptedAnswers: [String]?
    }

    public struct DebateTopic: Decodable, Sendable {
        public let id: String
        public let text: String
    }

    public let version: Int
    public let drawingPrompts: [DrawingPrompt]
    public let debateTopics: [String: [DebateTopic]]
    public let slideIDs: [String]

    public static let bundled: HostGameCatalog? = {
        guard let url = Bundle.module.url(forResource: "HostCatalog", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(HostGameCatalog.self, from: data)
    }()

    public func payload(
        gameID: GameID,
        difficulty: GameDifficulty,
        playerCount: Int
    ) -> StartMatchPayload? {
        switch gameID {
        case .quemErraPaga:
            guard let quiz = QuizCatalog.bundled else { return nil }
            let deck = quiz.decks[difficulty.rawValue] ?? quiz.decks[GameDifficulty.medium.rawValue] ?? []
            let order = Array(deck.indices.shuffled().prefix(min(10, deck.count)))
            guard !order.isEmpty else { return nil }
            return StartMatchPayload(
                prompts: [], topics: [], questionOrder: order,
                correctOptions: order.map { deck[$0].correctAnswer ?? -1 },
                slideIDs: [], punishmentCount: quiz.punishments.count
            )

        case .advogadoDoDiabo:
            let deck = debateTopics[difficulty.rawValue]
                ?? debateTopics[GameDifficulty.medium.rawValue]
                ?? []
            let topics = deck.shuffled().prefix(min(20, deck.count)).map {
                StartMatchTopic(id: $0.id, source: "default", text: $0.text)
            }
            guard !topics.isEmpty else { return nil }
            return StartMatchPayload(
                prompts: [], topics: Array(topics), questionOrder: [],
                correctOptions: [], slideIDs: [], punishmentCount: 0
            )

        case .drawingTelephone:
            let prompts = drawingPrompts.shuffled().prefix(playerCount).map {
                StartMatchPrompt(
                    id: $0.id, text: $0.text,
                    acceptedAnswers: $0.acceptedAnswers ?? []
                )
            }
            guard playerCount > 0, prompts.count == playerCount else { return nil }
            return StartMatchPayload(
                prompts: Array(prompts), topics: [], questionOrder: [],
                correctOptions: [], slideIDs: [], punishmentCount: 0
            )

        case .improvSlides:
            guard slideIDs.count >= 5 else { return nil }
            return StartMatchPayload(
                prompts: [], topics: [], questionOrder: [], correctOptions: [],
                slideIDs: slideIDs, punishmentCount: 0
            )
        }
    }
}

public extension SnapshotRoom {
    var difficulty: GameDifficulty {
        guard case let .string(value) = settings["difficulty"] else { return .medium }
        return GameDifficulty(rawValue: value) ?? .medium
    }
}

public extension GameID {
    var minimumPlayers: Int {
        switch self {
        case .drawingTelephone: 4
        case .quemErraPaga, .advogadoDoDiabo, .improvSlides: 2
        }
    }
}
