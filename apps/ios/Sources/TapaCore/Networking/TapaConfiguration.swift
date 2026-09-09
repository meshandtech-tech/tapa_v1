import Foundation

public struct TapaConfiguration: Equatable, Sendable {
    public enum ConfigurationError: LocalizedError, Equatable {
        case missingSupabaseURL
        case invalidSupabaseURL
        case missingSupabaseAnonKey

        public var errorDescription: String? {
            switch self {
            case .missingSupabaseURL:
                "SUPABASE_URL não foi configurada."
            case .invalidSupabaseURL:
                "SUPABASE_URL não é uma URL válida."
            case .missingSupabaseAnonKey:
                "SUPABASE_ANON_KEY não foi configurada."
            }
        }
    }

    public let supabaseURL: URL
    public let supabaseAnonKey: String

    public init(supabaseURL: URL, supabaseAnonKey: String) {
        self.supabaseURL = supabaseURL
        self.supabaseAnonKey = supabaseAnonKey
    }

    public init(bundle: Bundle = .main, environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        let rawURL = environment["SUPABASE_URL"]
            ?? bundle.object(forInfoDictionaryKey: "TapaSupabaseURL") as? String
        let rawKey = environment["SUPABASE_ANON_KEY"]
            ?? bundle.object(forInfoDictionaryKey: "TapaSupabaseAnonKey") as? String

        guard let rawURL, !rawURL.isEmpty else {
            throw ConfigurationError.missingSupabaseURL
        }
        guard let url = URL(string: rawURL), url.scheme == "https" else {
            throw ConfigurationError.invalidSupabaseURL
        }
        guard let rawKey, !rawKey.isEmpty else {
            throw ConfigurationError.missingSupabaseAnonKey
        }

        self.init(supabaseURL: url, supabaseAnonKey: rawKey)
    }
}
