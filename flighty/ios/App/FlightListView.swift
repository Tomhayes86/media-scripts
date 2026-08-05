import SwiftUI

struct FlightListView: View {
    @StateObject private var vm = FlightListViewModel()
    @State private var showingAdd = false
    @State private var showingImport = false
    @State private var showingHistory = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.loading && vm.flights.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.flights.isEmpty {
                    ContentUnavailableView(
                        "No flights",
                        systemImage: "airplane",
                        description: Text("Tap + to add a flight by number and date.")
                    )
                } else {
                    List {
                        ForEach(vm.flights) { f in
                            NavigationLink(value: f) {
                                FlightCard(flight: f)
                            }
                            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                        }
                        .onDelete { idx in
                            Task { await vm.delete(at: idx) }
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await vm.load() }
                }
            }
            .navigationTitle("Flights")
            .navigationDestination(for: Flight.self) { f in
                FlightDetailView(flightId: f.id).environmentObject(vm)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button { showingImport = true } label: {
                            Label("From email", systemImage: "envelope")
                        }
                        Button { showingHistory = true } label: {
                            Label("Flight history (CSV)", systemImage: "books.vertical")
                        }
                    } label: {
                        Image(systemName: "tray.and.arrow.down")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus.circle.fill") }
                }
            }
            .sheet(isPresented: $showingAdd) {
                AddFlightView { number, date in
                    await vm.add(number: number, date: date)
                    showingAdd = false
                }
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $showingImport) {
                ImportEmailView { await vm.load() }
            }
            .sheet(isPresented: $showingHistory) {
                ImportHistoryView { await vm.load() }
            }
        }
        .task { await vm.load() }
    }
}

struct FlightCard: View {
    let flight: Flight

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(flight.flightNumber).font(.headline)
                    Spacer()
                    StatusPill(status: flight.status ?? "scheduled")
                }
                HStack(spacing: 12) {
                    Text(flight.originIata ?? "???").font(.title2).monospaced()
                    Image(systemName: "airplane").foregroundStyle(.secondary)
                    Text(flight.destinationIata ?? "???").font(.title2).monospaced()
                }
                HStack {
                    Text(FlightFormat.time(flight.estimatedDep ?? flight.scheduledDep))
                    Image(systemName: "arrow.right").font(.caption).foregroundStyle(.secondary)
                    Text(FlightFormat.time(flight.estimatedArr ?? flight.scheduledArr))
                    Spacer()
                    Text(FlightFormat.date(flight.scheduledDep))
                        .foregroundStyle(.secondary)
                }
                .font(.subheadline)
            }
        }
        .padding(.vertical, 8)
    }
}

struct StatusPill: View {
    let status: String
    var body: some View {
        Text(status.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.caption).bold()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
    private var color: Color {
        switch status.lowercased() {
        case "en_route", "enroute", "active": return .green
        case "landed", "arrived":              return .blue
        case "delayed", "diverted":            return .orange
        case "cancelled":                      return .red
        default:                                return .gray
        }
    }
}

enum FlightFormat {
    static let time: (Date?) -> String = { d in
        guard let d else { return "—" }
        let f = DateFormatter()
        f.timeStyle = .short
        return f.string(from: d)
    }
    static let date: (Date?) -> String = { d in
        guard let d else { return "" }
        let f = DateFormatter()
        f.dateFormat = "EEE d MMM"
        return f.string(from: d)
    }
}

@MainActor
final class FlightListViewModel: ObservableObject {
    @Published var flights: [Flight] = []
    @Published var loading = false
    @Published var error: String?

    func load() async {
        loading = true
        defer { loading = false }
        do {
            flights = try await API.shared.listFlights()
            AirportGeofencer.shared.sync(with: flights)
        }
        catch { self.error = error.localizedDescription }
    }

    func add(number: String, date: String) async {
        do {
            _ = try await API.shared.addFlight(number: number, date: date)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func delete(at offsets: IndexSet) async {
        let toDelete = offsets.map { flights[$0] }
        flights.remove(atOffsets: offsets)
        for f in toDelete {
            try? await API.shared.deleteFlight(id: f.id)
            await LiveActivityManager.shared.end(for: f.id)
        }
    }
}
