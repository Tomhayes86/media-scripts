import UIKit
import SwiftUI
import UniformTypeIdentifiers

// Action extension entry. Any Share sheet that carries text or an .eml file
// can hand it to Flighty; we parse it via /api/import/email and confirm.
final class ShareViewController: UIViewController {
    private var text: String = ""
    private var host: UIHostingController<ShareView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        Task {
            let raw = await loadSharedContent()
            await MainActor.run {
                self.text = raw
                self.mount()
            }
        }
    }

    private func mount() {
        let view = ShareView(
            initialText: text,
            onDone: { [weak self] in self?.close() }
        )
        let host = UIHostingController(rootView: view)
        addChild(host)
        host.view.frame = self.view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.view.backgroundColor = .clear
        self.view.addSubview(host.view)
        host.didMove(toParent: self)
        self.host = host
    }

    private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    // Walks the extension inputs and returns the first usable body.
    private func loadSharedContent() async -> String {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return "" }
        for item in items {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let s = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String, !s.isEmpty {
                        return s
                    }
                }
                if provider.hasItemConformingToTypeIdentifier("public.email-message") {
                    if let url = try? await provider.loadItem(forTypeIdentifier: "public.email-message") as? URL,
                       let data = try? Data(contentsOf: url),
                       let s = String(data: data, encoding: .utf8) {
                        return s
                    }
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                        return url.absoluteString
                    }
                }
            }
        }
        return ""
    }
}

struct ShareView: View {
    let initialText: String
    let onDone: () -> Void

    @State private var text: String = ""
    @State private var busy = false
    @State private var results: [ShareImportResult] = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Content") {
                    TextEditor(text: $text)
                        .font(.body.monospaced())
                        .frame(minHeight: 160)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                if !results.isEmpty {
                    Section("Results") {
                        ForEach(results, id: \.self) { r in
                            HStack {
                                Text("\(r.flightNumber) · \(r.flightDate)")
                                Spacer()
                                Text(r.status).foregroundStyle(color(for: r.status))
                            }
                            .font(.subheadline)
                        }
                    }
                }
            }
            .onAppear { text = initialText }
            .navigationTitle("Send to Flighty")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { onDone() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") { Task { await submit() } }
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
            }
            .overlay { if busy { ProgressView().controlSize(.large) } }
        }
    }

    private func submit() async {
        busy = true; error = nil; results = []
        defer { busy = false }
        do {
            let url = SharedAppConfig.apiBaseURL.appendingPathComponent("/api/import/email")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: ["raw": text])
            let (data, _) = try await URLSession.shared.data(for: req)
            struct Wrapper: Decodable { let added: [ShareImportResult] }
            self.results = try JSONDecoder().decode(Wrapper.self, from: data).added
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func color(for status: String) -> Color {
        switch status {
        case "added":     return .green
        case "exists":    return .blue
        case "not_found": return .orange
        default:          return .red
        }
    }
}

struct ShareImportResult: Decodable, Hashable {
    let flightNumber: String
    let flightDate: String
    let status: String
    enum CodingKeys: String, CodingKey {
        case flightNumber = "flight_number"
        case flightDate   = "flight_date"
        case status
    }
}

// Extensions can't reach the app's AppConfig without sharing the file.
// We include a minimal read-only mirror here that reads the API URL from
// the shared App Group defaults, written by the host app on first launch.
enum SharedAppConfig {
    static var apiBaseURL: URL {
        let defaults = UserDefaults(suiteName: "group.com.example.flighty") ?? .standard
        if let s = defaults.string(forKey: "apiBaseURL"), let u = URL(string: s) { return u }
        return URL(string: "https://flighty.example.workers.dev")!
    }
}
