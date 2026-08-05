import SwiftUI

struct ImportEmailView: View {
    var onImported: () async -> Void

    @State private var text: String = ""
    @State private var busy = false
    @State private var result: [ImportResult] = []
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        if let s = UIPasteboard.general.string { text = s }
                    } label: {
                        Label("Paste from clipboard", systemImage: "doc.on.clipboard")
                    }
                }
                Section("Email content") {
                    TextEditor(text: $text)
                        .font(.body.monospaced())
                        .frame(minHeight: 200)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                if !result.isEmpty {
                    Section("Results") {
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
            .navigationTitle("Import from email")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
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
        busy = true; error = nil; result = []
        defer { busy = false }
        do {
            result = try await API.shared.importEmail(text).added
            if !result.isEmpty { await onImported() }
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

struct ImportResult: Decodable, Identifiable {
    let flightNumber: String
    let flightDate: String
    let status: String
    let dbId: Int?
    let error: String?

    // Identifiable id: DB row when we have one, else a synthetic key from the fields.
    var id: String { "\(dbId.map(String.init) ?? "")|\(flightNumber)|\(flightDate)|\(status)" }

    enum CodingKeys: String, CodingKey {
        case flightNumber = "flight_number"
        case flightDate   = "flight_date"
        case status
        case dbId         = "id"
        case error
    }
}
