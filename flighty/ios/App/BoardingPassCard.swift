import SwiftUI

// Wallet-style pass card. Not a real PkPass (see DEPLOY.md for why).
struct BoardingPassCard: View {
    let flight: Flight

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(flight.airlineName ?? flight.airlineIata ?? "Airline")
                        .font(.caption).bold().foregroundStyle(.white.opacity(0.85))
                    Spacer()
                    Text(flight.flightNumber)
                        .font(.headline).foregroundStyle(.white)
                }
                HStack(alignment: .center, spacing: 12) {
                    airport(iata: flight.originIata, name: flight.originName)
                    Image(systemName: "airplane")
                        .font(.title2).foregroundStyle(.white.opacity(0.9))
                        .frame(maxWidth: .infinity)
                    airport(iata: flight.destinationIata, name: flight.destinationName)
                }
                HStack {
                    labeled("DEPARTS", FlightFormat.time(flight.estimatedDep ?? flight.scheduledDep))
                    Spacer()
                    labeled("ARRIVES", FlightFormat.time(flight.estimatedArr ?? flight.scheduledArr))
                }
            }
            .padding(16)
            .background(LinearGradient(colors: [.blue, .indigo], startPoint: .topLeading, endPoint: .bottomTrailing))

            // Perforation line
            HStack(spacing: 6) {
                ForEach(0..<30, id: \.self) { _ in
                    Circle().fill(.secondary.opacity(0.3)).frame(width: 4, height: 4)
                }
            }.padding(.vertical, 6).frame(maxWidth: .infinity).background(Color(.systemBackground))

            HStack {
                labeled("GATE", flight.gateDep ?? "—")
                Spacer()
                labeled("TERMINAL", flight.terminalDep ?? "—")
                Spacer()
                labeled("STATUS", (flight.status ?? "scheduled").uppercased())
            }
            .padding(16)
            .background(Color(.secondarySystemBackground))
        }
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.15), radius: 12, y: 6)
    }

    @ViewBuilder
    private func airport(iata: String?, name: String?) -> some View {
        VStack(alignment: .center, spacing: 2) {
            Text(iata ?? "???")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(name ?? "")
                .font(.caption2).foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
        }
    }

    private func labeled(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).bold().foregroundStyle(.secondary)
            Text(value).font(.headline)
        }
    }
}
