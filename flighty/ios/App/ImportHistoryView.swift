import SwiftUI
import UniformTypeIdentifiers

struct ImportHistoryView: View {
    var onImported: () async -> Void

    @State private var text: String = ""
    @State private var busy = false
    @State private var result: [ImportResult] = []
    @State private var skipped: Int = 0
    @State private var totalRows: Int = 0
    @State private var error: String?
    @State private var pickingFile = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        pickingFile = true
                    } label: {
                        Label("Choose CSV file", systemImage: "doc.text")
                    }
                    Button {
                        if let s = UIPasteboard.general.string { text = s }
                    } label: {
                        Label("Paste from clipboard", systemImage: "doc.on.clipboard")
                    }
                } footer: {
                    Text("Works with Flighty export, App in the Air export, or any CSV/text with flight numbers and dates.")
                        .font(.caption)
                }

                Section("Content") {
                    TextEditor(text: $text)
                        .font(.body.monospaced())
                        .frame(minHeight: 200)
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                if !result.isEmpty {
                    Section("Results (\(summary))") {
                        ForEach(result) { r in
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
            .navigationTitle("Import history")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import all") { Task { await submit() } }
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
            }
            .overlay { if busy { ProgressView().controlSize(.large) } }
            .fileImporter(
                isPresented: $pickingFile,
                allowedContentTypes: [.commaSeparatedText, .plainText, .tabSeparatedText, .text],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    if let url = urls.first, url.startAccessingSecurityScopedResource() {
                        defer { url.stopAccessingSecurityScopedResource() }
                        text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
                    }
                case .failure(let e):
                    self.error = e.localizedDescription
                }
            }
        }
    }

    private var summary: String {
        let counts = Dictionary(grouping: result, by: { $0.status })
            .mapValues { $0.count }
            .sorted { $0.key < $1.key }
        var parts = counts.map { "\($0.value) \($0.key)" }
        if skipped > 0 { parts.append("\(skipped) skipped") }
        let denom = totalRows > 0 ? totalRows : (result.count + skipped)
        return "\(result.count) of \(denom) rows — " + parts.joined(separator: " · ")
    }

    private func submit() async {
        busy = true; error = nil; result = []; skipped = 0; totalRows = 0
        defer { busy = false }
        do {
            let resp = try await API.shared.importBulk(text)
            result = resp.added
            skipped = resp.skipped ?? 0
            totalRows = resp.totalRows ?? 0
            if !result.isEmpty { await onImported() }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func color(for status: String) -> Color {
        switch status {
        case "added":         return .green
        case "added_manual":  return .mint
        case "exists":        return .blue
        case "not_found":     return .orange
        default:              return .red
        }
    }
}
