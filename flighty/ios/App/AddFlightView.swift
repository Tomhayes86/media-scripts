import SwiftUI

struct AddFlightView: View {
    var onAdd: (String, String) async -> Void

    @State private var number: String = ""
    @State private var date: Date = .now
    @State private var busy = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Flight number (e.g. BA286)", text: $number)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                } footer: {
                    if let error { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Add flight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task { await submit() }
                    }
                    .disabled(number.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
            }
            .overlay {
                if busy { ProgressView().controlSize(.large) }
            }
        }
    }

    private func submit() async {
        busy = true
        defer { busy = false }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        let ds = f.string(from: date)
        await onAdd(number.trimmingCharacters(in: .whitespaces).uppercased(), ds)
    }
}
