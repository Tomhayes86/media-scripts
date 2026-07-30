import SwiftUI
import PassKit

// A button that downloads the flight's .pkpass from the backend
// and hands it to Apple Wallet via PKAddPassesViewController.
struct AddToWalletButton: View {
    let flightId: Int
    @State private var presenting = false
    @State private var pass: PKPass?
    @State private var error: String?

    var body: some View {
        Button {
            Task { await load() }
        } label: {
            Label("Add to Apple Wallet", systemImage: "wallet.pass")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(.black)
        .sheet(isPresented: $presenting) {
            if let pass {
                AddPassView(pass: pass) { presenting = false }
            }
        }
        .alert("Wallet pass failed", isPresented: .init(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
    }

    private func load() async {
        let url = AppConfig.apiBaseURL.appendingPathComponent("/api/flights/\(flightId)/pkpass")
        do {
            let (data, resp) = try await URLSession.shared.data(from: url)
            if let http = resp as? HTTPURLResponse, http.statusCode == 501 {
                error = "Wallet passes aren't configured on the server yet. See WALLET.md."
                return
            }
            let p = try PKPass(data: data)
            pass = p
            presenting = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// UIViewControllerRepresentable wrapper so a SwiftUI sheet can host
// PKAddPassesViewController (which is UIKit-only).
private struct AddPassView: UIViewControllerRepresentable {
    let pass: PKPass
    let onDismiss: () -> Void

    func makeUIViewController(context: Context) -> PKAddPassesViewController {
        let vc = PKAddPassesViewController(pass: pass) ?? PKAddPassesViewController()
        vc.delegate = context.coordinator
        return vc
    }
    func updateUIViewController(_ vc: PKAddPassesViewController, context: Context) {}
    func makeCoordinator() -> Coord { Coord(onDismiss: onDismiss) }

    final class Coord: NSObject, PKAddPassesViewControllerDelegate {
        let onDismiss: () -> Void
        init(onDismiss: @escaping () -> Void) { self.onDismiss = onDismiss }
        func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
            onDismiss()
        }
    }
}
