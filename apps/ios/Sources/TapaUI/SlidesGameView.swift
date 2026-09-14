import SwiftUI
import TapaCore
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

#if canImport(UIKit)
private typealias SlidePlatformImage = UIImage
#elseif canImport(AppKit)
private typealias SlidePlatformImage = NSImage
#endif

struct SlidesGameView: View {
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot
    var body: some View {
        VStack(spacing: 22) {
            GameHeader(title: "PITCH NO ESCURO", snapshot: snapshot)
            if !snapshot.isMatchParticipant { SpectatorNotice() }
            switch snapshot.room.phase {
            case .gameIntro:
                TapaMessage(icon: "rectangle.on.rectangle.angled", title: "COMO SE JOGA",
                            detail: "Você recebe 5 slides aleatórios, vê o primeiro por 20 segundos e transforma tudo numa história. Depois são 20 segundos por slide; eles passam sozinhos.")
            case .playerSpin:
                PlayerSpinner(
                    title: "PRÓXIMO A APRESENTAR",
                    players: snapshot.slidesPresenterCandidates,
                    winnerID: snapshot.currentPresenter?.id
                )
            case .playerReveal:
                TapaMessage(icon: "person.crop.circle.badge.questionmark",
                            title: snapshot.isCurrentPresenter ? "É VOCÊ." : (snapshot.currentPresenter?.nickname.uppercased() ?? "QUEM SERÁ?"),
                            detail: snapshot.isCurrentPresenter ? "Respira. Faça o nada parecer estratégia." : "Prepare o dedo para dar a nota.")
            case .preparation:
                preparation
            case .countdown:
                VStack(spacing: 18) {
                    PartyTimer(snapshot: snapshot, serverOffset: model.serverOffset)
                    Text(snapshot.isCurrentPresenter ? "BOA SORTE" : "VAI COMEÇAR")
                        .font(.title.weight(.black)).foregroundStyle(.white)
                }
            case .presentation:
                presentation
            case .voting:
                voting
            case .scoreReveal:
                scoreReveal
            case .gameOver:
                RankingView(snapshot: snapshot, usesDecimalScores: true, title: "RESULTADO FINAL")
            default:
                WaitingForHost()
            }
        }
        .accessibilityIdentifier("native-slides-\(snapshot.room.phase.rawValue)")
        .task(id: snapshot.match?.slideIds.joined(separator: "|")) {
            // Decode all five images during the spin/reveal/preparation window,
            // before the 20-second slide clock starts.
            SlideAssetCache.preload(ids: snapshot.match?.slideIds ?? [])
        }
    }

    private var preparation: some View {
        VStack(spacing: 18) {
            TapaMessage(icon: "brain.head.profile",
                        title: snapshot.isCurrentPresenter ? "VOCÊ É O PRÓXIMO" : "\(snapshot.currentPresenter?.nickname.uppercased() ?? "ALGUÉM") SE PREPARA",
                        detail: snapshot.isCurrentPresenter ? "Começo, meio e fim. Os outros quatro slides continuam surpresa." : "Prepare o dedo para avaliar.")
            if snapshot.isCurrentPresenter, let first = snapshot.match?.slideIds.first {
                Text("SEU PRIMEIRO SLIDE")
                    .font(.caption.weight(.black))
                    .tracking(2)
                    .foregroundStyle(.white)
                SlideImage(id: first)
                Text("Começa por aqui. Os outros quatro são surpresa.")
                    .font(.callout.weight(.bold))
                    .foregroundStyle(.white)
            }
            PartyTimer(snapshot: snapshot, serverOffset: model.serverOffset)
        }
    }

    private var presentation: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let progress = snapshot.slidesProgress(at: context.date, serverOffset: model.serverOffset)
            VStack(spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(snapshot.currentPresenter?.nickname.uppercased() ?? "APRESENTAÇÃO")
                            .font(.headline.weight(.black))
                        if SlidesRules.beats.indices.contains(progress.index) {
                            Text(SlidesRules.beats[progress.index].uppercased())
                                .font(.caption2.weight(.black))
                                .tracking(1)
                        }
                    }
                    .foregroundStyle(.white)
                    Spacer()
                    Text("\(progress.index + 1) / \(SlidesRules.slidesPerPresentation) · \(progress.remainingSeconds)s")
                        .font(.system(.headline, design: .monospaced, weight: .black)).padding(10).paper()
                }
                if let slides = snapshot.match?.slideIds, slides.indices.contains(progress.index) {
                    SlideImage(id: slides[progress.index])
                } else {
                    TapaMessage(icon: "photo.badge.exclamationmark", title: "SLIDE INDISPONÍVEL",
                                detail: "O estado da sala não trouxe esta imagem.")
                }
            }
        }
    }

    @ViewBuilder private var voting: some View {
        if snapshot.isCurrentPresenter {
            TapaMessage(icon: "eye.fill", title: "ESTÃO TE JULGANDO",
                        detail: "\(snapshot.slidesVotesIn) de \(snapshot.eligibleSlidesVoters.count) votos chegaram. Você não vota em si mesmo.")
        } else if !snapshot.isMatchParticipant {
            TapaMessage(icon: "eye.fill", title: "ASSISTINDO A VOTAÇÃO",
                        detail: "Você entrou durante a partida e vota na próxima.")
        } else if let id = snapshot.me.playerId, let vote = snapshot.votes[id] {
            TapaMessage(icon: "checkmark.seal.fill", title: "VOTO REGISTRADO",
                        detail: snapshot.slidesVotesMissing > 0
                            ? "\(VoteScale.slides.first { $0.value == Int(vote) }?.label ?? "NOTA ENVIADA") · faltam \(snapshot.slidesVotesMissing)"
                            : "Esperando o host mostrar a nota.")
        } else {
            VotePanel(title: "Que nota para \(snapshot.currentPresenter?.nickname ?? "a apresentação")?",
                      items: VoteScale.slides,
                      disabled: model.isSubmitting,
                      action: model.submitVote)
        }
    }

    private var scoreReveal: some View {
        let presenter = snapshot.currentPresenter
        let score = snapshot.currentSlidesScore
        return TapaMessage(icon: "star.fill",
                           title: score.map { String(format: "%.1f / 5", $0) } ?? "— / 5",
                           detail: "\(presenter?.nickname ?? "Quem apresentou"): \(slidesVerdict(for: score))")
    }
}

private struct SlideImage: View {
    let id: String
    var body: some View {
        Group {
            if let image = SlideAssetCache.image(id: id) {
                image.resizable().scaledToFit()
            } else {
                ContentUnavailableView("Slide não encontrado", systemImage: "photo",
                                       description: Text(id))
            }
        }
        .frame(maxWidth: .infinity, minHeight: 220, maxHeight: 440)
        .background(.white).overlay(Rectangle().stroke(.black, lineWidth: 3))
        .accessibilityLabel("Slide \(id)")
    }

}

private enum SlideAssetCache {
    private static let cache = NSCache<NSString, SlidePlatformImage>()
    private static let preloadQueue = DispatchQueue(label: "app.tapa.slide-preload", qos: .utility)

    static func image(id: String) -> Image? {
        guard let platform = platformImage(id: id) else { return nil }
        #if canImport(UIKit)
        return Image(uiImage: platform)
        #elseif canImport(AppKit)
        return Image(nsImage: platform)
        #endif
    }

    static func preload(ids: [String]) {
        preloadQueue.async {
            for id in ids { _ = platformImage(id: id) }
        }
    }

    private static func platformImage(id: String) -> SlidePlatformImage? {
        if let cached = cache.object(forKey: id as NSString) { return cached }
        for ext in ["png", "jpg", "jpeg", "webp", "avif", "gif"] {
            let url = Bundle.main.url(forResource: id, withExtension: ext, subdirectory: "slides")
                ?? Bundle.main.url(forResource: id, withExtension: ext)
            guard let url else { continue }
            #if canImport(UIKit)
            guard let platform = UIImage(contentsOfFile: url.path) else { continue }
            #elseif canImport(AppKit)
            guard let platform = NSImage(contentsOf: url) else { continue }
            #endif
            cache.setObject(platform, forKey: id as NSString)
            return platform
        }
        return nil
    }
}
