import Foundation

@MainActor
public final class API: ObservableObject {
    public static let shared = API()
    private let session: URLSession = .shared

    private func decoder() -> JSONDecoder { JSONDecoder() }

    private func url(_ path: String) -> URL { AppConfig.apiBaseURL.appendingPathComponent(path) }

    public func listFlights() async throws -> [Flight] {
        let (data, _) = try await session.data(from: url("/api/flights"))
        return try decoder().decode([Flight].self, from: data)
    }

    public func addFlight(number: String, date: String) async throws -> Flight {
        var req = URLRequest(url: url("/api/flights"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "flight_number": number, "flight_date": date
        ])
        let (data, resp) = try await session.data(for: req)
        try Self.throwIfBad(resp, data: data)
        return try decoder().decode(Flight.self, from: data)
    }

    public func getFlight(id: Int) async throws -> Flight {
        let (data, _) = try await session.data(from: url("/api/flights/\(id)"))
        return try decoder().decode(Flight.self, from: data)
    }

    public func refreshFlight(id: Int) async throws -> Flight {
        var req = URLRequest(url: url("/api/flights/\(id)/refresh"))
        req.httpMethod = "POST"
        let (data, resp) = try await session.data(for: req)
        try Self.throwIfBad(resp, data: data)
        return try decoder().decode(Flight.self, from: data)
    }

    public func deleteFlight(id: Int) async throws {
        var req = URLRequest(url: url("/api/flights/\(id)"))
        req.httpMethod = "DELETE"
        _ = try await session.data(for: req)
    }

    public func setLiveTracking(id: Int, on: Bool) async throws -> Flight {
        var req = URLRequest(url: url("/api/flights/\(id)"))
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["live_tracking": on])
        let (data, _) = try await session.data(for: req)
        return try decoder().decode(Flight.self, from: data)
    }

    public func events(flightId: Int) async throws -> [FlightEvent] {
        let (data, _) = try await session.data(from: url("/api/flights/\(flightId)/events"))
        return try decoder().decode([FlightEvent].self, from: data)
    }

    public func positions(flightId: Int) async throws -> [FlightPosition] {
        let (data, _) = try await session.data(from: url("/api/flights/\(flightId)/positions"))
        return try decoder().decode([FlightPosition].self, from: data)
    }

    // ---- Email import ----

    public struct ImportResponse: Decodable {
        public let added: [ImportResult]
        public let skipped: Int?
        public let totalRows: Int?
        enum CodingKeys: String, CodingKey {
            case added, skipped
            case totalRows = "totalRows"
        }
    }

    public func importEmail(_ raw: String) async throws -> ImportResponse {
        try await postImport(path: "/api/import/email", raw: raw)
    }

    public func importBulk(_ raw: String) async throws -> ImportResponse {
        try await postImport(path: "/api/import/bulk", raw: raw)
    }

    private func postImport(path: String, raw: String) async throws -> ImportResponse {
        var req = URLRequest(url: url(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["raw": raw])
        let (data, resp) = try await session.data(for: req)
        try Self.throwIfBad(resp, data: data)
        return try JSONDecoder().decode(ImportResponse.self, from: data)
    }

    // ---- APNs registration ----

    public func registerDevice(token: String, name: String?) async throws {
        var req = URLRequest(url: url("/api/ios/register"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["device_token": token]
        if let name { body["device_name"] = name }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await session.data(for: req)
    }

    // ---- Live Activity token registration ----

    public func registerLiveActivity(flightId: Int, pushToken: String) async throws {
        var req = URLRequest(url: url("/api/flights/\(flightId)/live-activity"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["push_token": pushToken])
        _ = try await session.data(for: req)
    }

    public func endLiveActivity(flightId: Int, pushToken: String) async throws {
        var req = URLRequest(url: url("/api/flights/\(flightId)/live-activity"))
        req.httpMethod = "DELETE"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["push_token": pushToken])
        _ = try await session.data(for: req)
    }

    static func throwIfBad(_ resp: URLResponse, data: Data) throws {
        guard let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) else { return }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let msg = obj["error"] as? String {
            throw NSError(domain: "API", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        throw NSError(domain: "API", code: http.statusCode)
    }
}
