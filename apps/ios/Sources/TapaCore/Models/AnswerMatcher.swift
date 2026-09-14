import Foundation

/// Mirrors the drawing game's web/Postgres comparison rules for presentation.
/// Supabase remains authoritative for scoring; this avoids the native reveal
/// contradicting the score while it renders the same snapshot.
public enum AnswerMatcher {
    private static let fillerWords: Set<String> = [
        "o", "a", "os", "as",
        "um", "uma", "uns", "umas",
        "de", "do", "da", "dos", "das",
        "em", "no", "na", "nos", "nas",
        "ao", "aos", "e",
    ]

    public static func normalize(_ text: String) -> String {
        let folded = text.folding(
            options: [.diacriticInsensitive, .caseInsensitive],
            locale: Locale(identifier: "pt_BR")
        )
        let words = folded.unicodeScalars.split { scalar in
            !CharacterSet.alphanumerics.contains(scalar)
        }
        return words.map(String.init).joined(separator: " ")
    }

    public static func loose(_ text: String) -> String {
        let normalized = normalize(text)
        let meaningful = normalized.split(separator: " ").filter {
            !fillerWords.contains(String($0))
        }
        return meaningful.isEmpty ? normalized : meaningful.joined(separator: " ")
    }

    public static func matches(
        guess: String,
        prompt: String,
        acceptedAnswers: [String] = []
    ) -> Bool {
        let normalizedGuess = normalize(guess)
        guard !normalizedGuess.isEmpty else { return false }
        return ([prompt] + acceptedAnswers).contains { target in
            let normalizedTarget = normalize(target)
            guard !normalizedTarget.isEmpty else { return false }
            return normalizedGuess == normalizedTarget || loose(guess) == loose(target)
        }
    }
}
