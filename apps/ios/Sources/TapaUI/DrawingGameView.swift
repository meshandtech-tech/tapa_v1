import SwiftUI
import TapaCore

struct DrawingGameView: View {
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot

    var body: some View {
        VStack(spacing: 20) {
            GameHeader(title: "TELEFONE SEM FIO", snapshot: snapshot)
            if !snapshot.isMatchParticipant, snapshot.room.phase != .revealPage {
                spectator
            } else {
                phaseContent
            }
            if let error = model.actionError {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.callout.weight(.bold)).padding().paper()
            }
        }.accessibilityIdentifier("native-drawing-\(snapshot.room.phase.rawValue)")
    }

    @ViewBuilder private var phaseContent: some View {
        switch snapshot.room.phase {
        case .gameIntro:
            TapaMessage(icon: "book.pages.fill", title: "DESENHA. PASSA.\nTENTA ENTENDER.",
                        detail: "Você desenha uma palavra secreta. O caderno passa; outra pessoa adivinha, a próxima desenha o palpite e o estrago cresce.")
        case .passing:
            TapaMessage(icon: "arrow.right.arrow.left.circle.fill", title: "PASSA O CADERNO",
                        detail: "Ninguém troca o celular. O Supabase está distribuindo a próxima página.")
        case .drawStep:
            drawingStep
        case .guessStep:
            guessStep
        case .revealIntro:
            TapaMessage(icon: "sparkles.rectangle.stack.fill", title: "OS CADERNOS VOLTARAM",
                        detail: "\(snapshot.chains.count) caderno(s) deram a volta. Agora todo mundo vê o estrago junto.")
        case .revealPage:
            reveal
        case .gameOver:
            RankingView(snapshot: snapshot, usesDecimalScores: false, title: "PLACAR FINAL")
        default:
            WaitingForHost()
        }
    }

    private var spectator: some View {
        let completed = snapshot.match?.submittedPlayerIds.count ?? 0
        let total = snapshot.match?.seatOrder.count ?? 0
        return TapaMessage(icon: "hourglass", title: "VOCÊ ENTRA NA PRÓXIMA",
                           detail: "A partida já começou. Passo \((snapshot.match?.stepIndex ?? 0) + 1) de \(snapshot.match?.stepCount ?? 0) · \(completed)/\(total) entregaram.")
    }

    @ViewBuilder private var drawingStep: some View {
        if snapshot.me.submitted {
            submissionWaiting(title: "DESENHO ENVIADO")
        } else if let assignment = snapshot.assignment {
            NativeDrawingCanvas(model: model, snapshot: snapshot, assignment: assignment)
        } else {
            TapaMessage(icon: "wifi.exclamationmark", title: "BUSCANDO SEU CADERNO",
                        detail: "A tarefa não chegou ainda. A sincronização tentará novamente sem inventar uma página.")
        }
    }

    @ViewBuilder private var guessStep: some View {
        if snapshot.me.submitted {
            submissionWaiting(title: "PALPITE ENVIADO")
        } else if let assignment = snapshot.assignment {
            NativeGuessView(model: model, snapshot: snapshot, assignment: assignment)
        } else {
            TapaMessage(icon: "wifi.exclamationmark", title: "BUSCANDO SEU CADERNO",
                        detail: "A tarefa não chegou ainda. Aguarde a próxima sincronização.")
        }
    }

    private func submissionWaiting(title: String) -> some View {
        let done = snapshot.match?.submittedPlayerIds.count ?? 0
        let total = snapshot.match?.seatOrder.count ?? 0
        return TapaMessage(icon: "checkmark.seal.fill", title: title,
                           detail: "\(done) de \(total) pessoas já entregaram. Seu envio está confirmado.")
    }

    @ViewBuilder private var reveal: some View {
        if let match = snapshot.match,
           snapshot.chains.indices.contains(match.revealChainIndex) {
            let chain = snapshot.chains[match.revealChainIndex]
            let pageIndex = match.revealPageIndex
            VStack(spacing: 16) {
                Text("CADERNO \(match.revealChainIndex + 1) / \(snapshot.chains.count)")
                    .font(.caption.weight(.black)).padding(10).paper(fill: TapaPalette.lime)
                if pageIndex == 0 {
                    TopicCard(topic: chain.originalPrompt, caption: "TUDO COMEÇOU COM")
                } else if pageIndex <= match.stepCount,
                          let page = chain.pages.first(where: { $0.stepIndex == pageIndex - 1 }) {
                    RevealPage(model: model, snapshot: snapshot, page: page)
                } else {
                    ChainComparison(snapshot: snapshot, chain: chain)
                }
            }
        } else {
            TapaMessage(icon: "books.vertical.fill", title: "ABRINDO O CADERNO",
                        detail: "Esperando a página oficial da revelação.")
        }
    }
}

private struct NativeGuessView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot
    let assignment: SnapshotAssignment
    @State private var text: String
    @State private var requestedSubmission = false

    init(model: LobbyViewModel, snapshot: RoomSnapshot, assignment: SnapshotAssignment) {
        self.model = model
        self.snapshot = snapshot
        self.assignment = assignment
        _text = State(initialValue: UserDefaults.standard.string(
            forKey: Self.draftKey(snapshot: snapshot, assignment: assignment)
        ) ?? "")
    }
    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text("O QUE É ISSO?").font(.title2.weight(.black))
                Spacer()
                PartyTimer(snapshot: snapshot, serverOffset: model.serverOffset)
                    .frame(width: 116)
            }
            DrawingReplayView(model: model, storagePath: assignment.previous?.storagePath,
                              strokes: assignment.previous?.strokes,
                              status: assignment.previous?.status)
                .aspectRatio(1, contentMode: .fit).paper()
            guessField.font(.title3.weight(.bold)).padding(16).paper()
            Button { submit() } label: {
                Label(model.isSubmitting ? "ENVIANDO…" : "ENVIAR PALPITE", systemImage: "paperplane.fill")
            }.buttonStyle(TapaButtonStyle(dark: true))
                .disabled(model.isSubmitting || requestedSubmission
                          || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .onChange(of: text) { _, value in
            UserDefaults.standard.set(value, forKey: Self.draftKey(snapshot: snapshot, assignment: assignment))
        }
        .onChange(of: snapshot.me.submitted) { _, submitted in
            if submitted {
                UserDefaults.standard.removeObject(forKey: Self.draftKey(snapshot: snapshot, assignment: assignment))
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { submit() }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { date in
            if snapshot.secondsRemaining(at: date, serverOffset: model.serverOffset) == 0 { submit() }
        }
    }

    @ViewBuilder private var guessField: some View {
        #if os(iOS)
        TextField("Escreve seu palpite…", text: $text)
            .textInputAutocapitalization(.sentences)
        #else
        TextField("Escreve seu palpite…", text: $text)
        #endif
    }

    private func submit() {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requestedSubmission, !clean.isEmpty, !snapshot.me.submitted else { return }
        requestedSubmission = true
        runProtectedGameAction(named: "Enviar palpite") {
            await model.submitGuess(clean)
            if !model.hasCurrentDrawingSubmission { requestedSubmission = false }
        }
    }

    private static func draftKey(snapshot: RoomSnapshot, assignment: SnapshotAssignment) -> String {
        "tapa.guess.\(snapshot.room.pin).\(snapshot.me.playerId ?? "none").\(assignment.chainId).\(assignment.stepIndex)"
    }
}

private struct NativeDrawingCanvas: View {
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot
    let assignment: SnapshotAssignment
    @State private var strokes: [DrawingStroke]
    @State private var activeStroke: DrawingStroke?
    @State private var tool: DrawingStroke.Tool = .brush
    @State private var colorIndex = 0
    @State private var width = 0.014
    @State private var requestedSubmission = false
    private let brushSizes = [0.006, 0.014, 0.032]
    private let palette = ["#111111", "#e63946", "#1d6fe0", "#2a9d4a", "#f2b705", "#7b2cbf", "#f4741f", "#8b5e3c"]

    init(model: LobbyViewModel, snapshot: RoomSnapshot, assignment: SnapshotAssignment) {
        self.model = model
        self.snapshot = snapshot
        self.assignment = assignment
        let key = Self.draftKey(snapshot: snapshot, assignment: assignment)
        let saved = UserDefaults.standard.data(forKey: key)
            .flatMap { try? JSONDecoder().decode([DrawingStroke].self, from: $0) } ?? []
        _strokes = State(initialValue: saved)
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(assignment.stepIndex == 0 ? "SUA PALAVRA SECRETA" : "DESENHE ISTO")
                        .font(.caption.weight(.black))
                    Text(prompt.isEmpty ? "—" : prompt).font(.title2.weight(.black))
                }.frame(maxWidth: .infinity, alignment: .leading).padding(14).paper()
                PartyTimer(snapshot: snapshot, serverOffset: model.serverOffset).frame(width: 116)
            }
            GeometryReader { proxy in
                Canvas { context, size in
                    for stroke in strokes + (activeStroke.map { [$0] } ?? []) {
                        draw(stroke, in: &context, size: size)
                    }
                }
                .background(.white).contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0)
                    .onChanged { gesture in
                        let point = DrawingPoint(x: gesture.location.x / proxy.size.width,
                                                 y: gesture.location.y / proxy.size.height)
                        if activeStroke == nil {
                            activeStroke = DrawingStroke(tool: tool, width: tool == .eraser ? width * 3.5 : width,
                                                         color: colorIndex, points: [point])
                        } else if let last = activeStroke?.points.last,
                                  hypot(point.x - last.x, point.y - last.y) >= 0.002 {
                            activeStroke?.points.append(point)
                        }
                    }
                    .onEnded { _ in
                        guard var finished = activeStroke else { return }
                        finished.points = DrawingCodec.simplified(finished.points)
                        strokes.append(finished)
                        activeStroke = nil
                        saveDraft()
                    })
                .allowsHitTesting(!model.isSubmitting && !requestedSubmission && snapshot.room.pausedAt == nil)
            }.aspectRatio(1, contentMode: .fit).paper()
            HStack {
                ForEach(Array(palette.enumerated()), id: \.offset) { index, hex in
                    Button {
                        colorIndex = index
                        tool = .brush
                    } label: {
                        Circle().fill(Color(tapaHexValue: hex)).frame(width: 27, height: 27)
                            .overlay(Circle().stroke(.black, lineWidth: colorIndex == index && tool == .brush ? 4 : 1))
                    }.accessibilityLabel("Cor \(index + 1)")
                }
            }.frame(maxWidth: .infinity).padding(10).paper()
            HStack {
                Button { if !strokes.isEmpty { strokes.removeLast(); saveDraft() } } label: {
                    Label("Desfazer", systemImage: "arrow.uturn.backward")
                }
                Button { tool = tool == .eraser ? .brush : .eraser } label: {
                    Label(tool == .eraser ? "Pincel" : "Borracha", systemImage: tool == .eraser ? "paintbrush" : "eraser")
                }
                Button { strokes.removeAll(); saveDraft() } label: {
                    Label("Limpar", systemImage: "trash")
                }
            }.font(.caption.weight(.bold)).buttonStyle(.bordered)
            HStack(spacing: 12) {
                Text("TRAÇO").font(.caption2.weight(.black))
                ForEach(Array(brushSizes.enumerated()), id: \.offset) { index, size in
                    Button {
                        width = size
                    } label: {
                        let diameter = CGFloat(8 + index * 6)
                        Circle()
                            .fill(Color.black)
                            .frame(width: diameter, height: diameter)
                            .frame(width: 38, height: 32)
                            .background(width == size ? TapaPalette.lime : Color.clear)
                            .overlay(Rectangle().stroke(.black, lineWidth: width == size ? 2 : 0))
                    }
                    .accessibilityLabel(["Traço fino", "Traço médio", "Traço grosso"][index])
                }
            }
            .frame(maxWidth: .infinity)
            .padding(8)
            .paper()
            Button { submit(status: .submitted) } label: {
                Label(model.isSubmitting ? "ENVIANDO…" : "ENVIAR DESENHO", systemImage: "paperplane.fill")
            }.buttonStyle(TapaButtonStyle(dark: true))
                .disabled(model.isSubmitting || requestedSubmission || snapshot.room.pausedAt != nil)
        }
        .onChange(of: snapshot.me.submitted) { _, submitted in
            if submitted { clearDraft() }
        }
        .onChange(of: scenePhase) { _, phase in
            // Match the web client: preserve a non-empty drawing before iOS
            // suspends the process, but don't turn a quick app switch with a
            // blank canvas into an early terminal submission.
            if phase == .background, hasVisibleStroke { submit(status: .timeout) }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { date in
            if snapshot.secondsRemaining(at: date, serverOffset: model.serverOffset) == 0 {
                submit(status: .timeout)
            }
        }
    }

    private var prompt: String {
        assignment.prompt ?? assignment.previous?.text ?? ""
    }

    private var hasVisibleStroke: Bool {
        (strokes + (activeStroke.map { [$0] } ?? [])).contains { !$0.points.isEmpty }
    }

    private func submit(status: SubmissionStatus) {
        guard !requestedSubmission, !snapshot.me.submitted else { return }
        requestedSubmission = true
        saveDraft()
        runProtectedGameAction(named: "Enviar desenho") {
            let payload = strokes + (activeStroke.map { [$0] } ?? [])
            await model.submitDrawing(strokes: DrawingCodec.encode(payload), status: status)
            if !model.hasCurrentDrawingSubmission { requestedSubmission = false }
        }
    }

    private func draw(_ stroke: DrawingStroke, in context: inout GraphicsContext, size: CGSize) {
        let points = stroke.points.map { CGPoint(x: $0.x * size.width, y: $0.y * size.height) }
        guard let first = points.first else { return }
        let color = stroke.tool == .eraser ? Color.white : Color(tapaHexValue: palette[min(stroke.color, palette.count - 1)])
        let lineWidth = max(1, stroke.width * min(size.width, size.height))
        if points.count == 1 {
            context.fill(Path(ellipseIn: CGRect(x: first.x - lineWidth / 2, y: first.y - lineWidth / 2,
                                                width: lineWidth, height: lineWidth)), with: .color(color))
            return
        }
        var path = Path()
        path.move(to: first)
        for point in points.dropFirst() { path.addLine(to: point) }
        context.stroke(path, with: .color(color),
                       style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
    }

    private func saveDraft() {
        let content = strokes + (activeStroke.map { [$0] } ?? [])
        if let data = try? JSONEncoder().encode(content) {
            UserDefaults.standard.set(data, forKey: Self.draftKey(snapshot: snapshot, assignment: assignment))
        }
    }
    private func clearDraft() {
        UserDefaults.standard.removeObject(forKey: Self.draftKey(snapshot: snapshot, assignment: assignment))
    }
    private static func draftKey(snapshot: RoomSnapshot, assignment: SnapshotAssignment) -> String {
        "tapa.drawing.\(snapshot.room.pin).\(snapshot.me.playerId ?? "none").\(assignment.chainId).\(assignment.stepIndex)"
    }
}

private struct DrawingReplayView: View {
    @Bindable var model: LobbyViewModel
    let storagePath: String?
    let strokes: JSONValue?
    let status: SubmissionStatus?
    @State private var imageURL: URL?
    private let palette = ["#111111", "#e63946", "#1d6fe0", "#2a9d4a", "#f2b705", "#7b2cbf", "#f4741f", "#8b5e3c"]
    var body: some View {
        ZStack {
            Color.white
            if let imageURL {
                AsyncImage(url: imageURL) { image in image.resizable().scaledToFit() }
                    placeholder: { ProgressView() }
            } else if let decoded = DrawingCodec.decode(strokes) {
                Canvas { context, size in
                    for stroke in decoded {
                        render(stroke, context: &context, size: size)
                    }
                }
            } else {
                ContentUnavailableView(fallback, systemImage: "pencil.slash")
            }
        }
        .task(id: storagePath) {
            if let storagePath { imageURL = await model.publicDrawingURL(path: storagePath) }
        }
    }
    private var fallback: String {
        switch status {
        case .missed: "Desenho não enviado"
        case .failed: "Desenho não recuperado"
        case .pending: "Desenho chegando"
        default: "Folha em branco"
        }
    }
    private func render(_ stroke: DrawingStroke, context: inout GraphicsContext, size: CGSize) {
        let points = stroke.points.map { CGPoint(x: $0.x * size.width, y: $0.y * size.height) }
        guard let first = points.first else { return }
        let color = stroke.tool == .eraser ? Color.white : Color(tapaHexValue: palette[min(stroke.color, palette.count - 1)])
        let width = max(1, stroke.width * min(size.width, size.height))
        var path = Path()
        path.move(to: first)
        if points.count == 1 {
            context.fill(Path(ellipseIn: CGRect(x: first.x - width / 2, y: first.y - width / 2,
                                                width: width, height: width)), with: .color(color))
        } else {
            for point in points.dropFirst() { path.addLine(to: point) }
            context.stroke(path, with: .color(color),
                           style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
        }
    }
}

private struct RevealPage: View {
    @Bindable var model: LobbyViewModel
    let snapshot: RoomSnapshot
    let page: SnapshotPage
    var body: some View {
        let author = snapshot.players.first { $0.id == page.playerId }?.nickname ?? "Alguém"
        VStack(spacing: 14) {
            Text("\(author.uppercased()) \(page.kind == "drawing" ? "DESENHOU" : "ACHOU QUE ERA")")
                .font(.headline.weight(.black))
            if page.kind == "drawing" {
                DrawingReplayView(model: model, storagePath: page.storagePath,
                                  strokes: page.strokes, status: page.status)
                    .aspectRatio(1, contentMode: .fit)
            } else {
                Text(page.text.isEmpty ? "NÃO ESCREVEU NADA" : page.text)
                    .font(.largeTitle.weight(.black)).multilineTextAlignment(.center).padding(24)
            }
        }.frame(maxWidth: .infinity).padding(18).paper()
    }
}

private struct ChainComparison: View {
    let snapshot: RoomSnapshot
    let chain: SnapshotChain
    var body: some View {
        let final = chain.pages.last(where: { $0.kind == "guess" })?.text
        let survived = chain.countedAsMatch || AnswerMatcher.matches(
            guess: final ?? "",
            prompt: chain.originalPrompt,
            acceptedAnswers: chain.acceptedAnswers
        )
        return VStack(spacing: 18) {
            TopicCard(topic: chain.originalPrompt, caption: "COMEÇOU COMO")
            Image(systemName: "arrow.down").font(.largeTitle.weight(.black))
            TopicCard(topic: final?.isEmpty == false ? final! : "NINGUÉM ESCREVEU", caption: "TERMINOU COMO")
            Label(survived ? "SOBREVIVEU!" : "PERDEU NO CAMINHO",
                  systemImage: survived ? "sparkles" : "xmark")
                .font(.title2.weight(.black)).padding().paper(fill: survived ? TapaPalette.lime : .white)
        }
    }
}

private extension Color {
    init(tapaHexValue: String) {
        let value = UInt64(tapaHexValue.trimmingCharacters(in: CharacterSet.alphanumerics.inverted), radix: 16) ?? 0
        self.init(red: Double((value >> 16) & 255) / 255,
                  green: Double((value >> 8) & 255) / 255,
                  blue: Double(value & 255) / 255)
    }
}
