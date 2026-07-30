import Foundation

// Mirrors the D1 `flights` row. Any nullable field is optional.
public struct Flight: Codable, Identifiable, Hashable, Sendable {
    public var id: Int
    public var flightNumber: String
    public var flightDate: String
    public var airlineIata: String?
    public var airlineName: String?
    public var originIata: String?
    public var originName: String?
    public var destinationIata: String?
    public var destinationName: String?
    public var scheduledDep: Date?
    public var scheduledArr: Date?
    public var estimatedDep: Date?
    public var estimatedArr: Date?
    public var actualDep: Date?
    public var actualArr: Date?
    public var status: String?
    public var gateDep: String?
    public var gateArr: String?
    public var terminalDep: String?
    public var terminalArr: String?
    public var aircraftReg: String?
    public var aircraftIcao24: String?
    public var liveTracking: Bool
    public var lastSynced: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case flightNumber = "flight_number"
        case flightDate   = "flight_date"
        case airlineIata  = "airline_iata"
        case airlineName  = "airline_name"
        case originIata   = "origin_iata"
        case originName   = "origin_name"
        case destinationIata = "destination_iata"
        case destinationName = "destination_name"
        case scheduledDep = "scheduled_dep"
        case scheduledArr = "scheduled_arr"
        case estimatedDep = "estimated_dep"
        case estimatedArr = "estimated_arr"
        case actualDep    = "actual_dep"
        case actualArr    = "actual_arr"
        case status
        case gateDep      = "gate_dep"
        case gateArr      = "gate_arr"
        case terminalDep  = "terminal_dep"
        case terminalArr  = "terminal_arr"
        case aircraftReg  = "aircraft_reg"
        case aircraftIcao24 = "aircraft_icao24"
        case liveTracking = "live_tracking"
        case lastSynced   = "last_synced"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        flightNumber = try c.decode(String.self, forKey: .flightNumber)
        flightDate = try c.decode(String.self, forKey: .flightDate)
        airlineIata = try c.decodeIfPresent(String.self, forKey: .airlineIata)
        airlineName = try c.decodeIfPresent(String.self, forKey: .airlineName)
        originIata = try c.decodeIfPresent(String.self, forKey: .originIata)
        originName = try c.decodeIfPresent(String.self, forKey: .originName)
        destinationIata = try c.decodeIfPresent(String.self, forKey: .destinationIata)
        destinationName = try c.decodeIfPresent(String.self, forKey: .destinationName)
        scheduledDep = Self.parseDate(try c.decodeIfPresent(String.self, forKey: .scheduledDep))
        scheduledArr = Self.parseDate(try c.decodeIfPresent(String.self, forKey: .scheduledArr))
        estimatedDep = Self.parseDate(try c.decodeIfPresent(String.self, forKey: .estimatedDep))
        estimatedArr = Self.parseDate(try c.decodeIfPresent(String.self, forKey: .estimatedArr))
        actualDep = Self.parseDate(try c.decodeIfPresent(String.self, forKey: .actualDep))
        actualArr = Self.parseDate(try c.decodeIfPresent(String.self, forKey: .actualArr))
        status = try c.decodeIfPresent(String.self, forKey: .status)
        gateDep = try c.decodeIfPresent(String.self, forKey: .gateDep)
        gateArr = try c.decodeIfPresent(String.self, forKey: .gateArr)
        terminalDep = try c.decodeIfPresent(String.self, forKey: .terminalDep)
        terminalArr = try c.decodeIfPresent(String.self, forKey: .terminalArr)
        aircraftReg = try c.decodeIfPresent(String.self, forKey: .aircraftReg)
        aircraftIcao24 = try c.decodeIfPresent(String.self, forKey: .aircraftIcao24)
        let live = try c.decodeIfPresent(Int.self, forKey: .liveTracking) ?? 0
        liveTracking = live != 0
        lastSynced = Self.parseDate(try c.decodeIfPresent(String.self, forKey: .lastSynced))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(flightNumber, forKey: .flightNumber)
        try c.encode(flightDate, forKey: .flightDate)
        try c.encodeIfPresent(airlineIata, forKey: .airlineIata)
        try c.encodeIfPresent(airlineName, forKey: .airlineName)
        try c.encodeIfPresent(originIata, forKey: .originIata)
        try c.encodeIfPresent(originName, forKey: .originName)
        try c.encodeIfPresent(destinationIata, forKey: .destinationIata)
        try c.encodeIfPresent(destinationName, forKey: .destinationName)
        try c.encodeIfPresent(scheduledDep.flatMap(Self.isoString), forKey: .scheduledDep)
        try c.encodeIfPresent(scheduledArr.flatMap(Self.isoString), forKey: .scheduledArr)
        try c.encodeIfPresent(estimatedDep.flatMap(Self.isoString), forKey: .estimatedDep)
        try c.encodeIfPresent(estimatedArr.flatMap(Self.isoString), forKey: .estimatedArr)
        try c.encodeIfPresent(actualDep.flatMap(Self.isoString), forKey: .actualDep)
        try c.encodeIfPresent(actualArr.flatMap(Self.isoString), forKey: .actualArr)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(gateDep, forKey: .gateDep)
        try c.encodeIfPresent(gateArr, forKey: .gateArr)
        try c.encodeIfPresent(terminalDep, forKey: .terminalDep)
        try c.encodeIfPresent(terminalArr, forKey: .terminalArr)
        try c.encodeIfPresent(aircraftReg, forKey: .aircraftReg)
        try c.encodeIfPresent(aircraftIcao24, forKey: .aircraftIcao24)
        try c.encode(liveTracking ? 1 : 0, forKey: .liveTracking)
        try c.encodeIfPresent(lastSynced.flatMap(Self.isoString), forKey: .lastSynced)
    }

    static let isoParser: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let isoParserNoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parseDate(_ s: String?) -> Date? {
        guard let s, !s.isEmpty else { return nil }
        return isoParser.date(from: s) ?? isoParserNoFrac.date(from: s)
    }
    static func isoString(_ d: Date) -> String { isoParser.string(from: d) }
}

public struct FlightEvent: Codable, Identifiable, Hashable, Sendable {
    public var id: Int
    public var flightId: Int
    public var kind: String
    public var detail: String?
    public var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case flightId = "flight_id"
        case kind
        case detail
        case createdAt = "created_at"
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        flightId = try c.decode(Int.self, forKey: .flightId)
        kind = try c.decode(String.self, forKey: .kind)
        detail = try c.decodeIfPresent(String.self, forKey: .detail)
        createdAt = Flight.parseDate(try c.decodeIfPresent(String.self, forKey: .createdAt))
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(flightId, forKey: .flightId)
        try c.encode(kind, forKey: .kind)
        try c.encodeIfPresent(detail, forKey: .detail)
        try c.encodeIfPresent(createdAt.flatMap(Flight.isoString), forKey: .createdAt)
    }
}

public struct FlightPosition: Codable, Hashable, Sendable {
    public var ts: Date?
    public var lat: Double
    public var lon: Double
    public var altitudeM: Double?
    public var velocityMs: Double?
    public var heading: Double?
    public var onGround: Bool?

    enum CodingKeys: String, CodingKey {
        case ts, lat, lon, heading
        case altitudeM = "altitude_m"
        case velocityMs = "velocity_ms"
        case onGround = "on_ground"
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ts = Flight.parseDate(try c.decodeIfPresent(String.self, forKey: .ts))
        lat = try c.decode(Double.self, forKey: .lat)
        lon = try c.decode(Double.self, forKey: .lon)
        altitudeM = try c.decodeIfPresent(Double.self, forKey: .altitudeM)
        velocityMs = try c.decodeIfPresent(Double.self, forKey: .velocityMs)
        heading = try c.decodeIfPresent(Double.self, forKey: .heading)
        let g = try c.decodeIfPresent(Int.self, forKey: .onGround)
        onGround = g.map { $0 != 0 }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(ts.flatMap(Flight.isoString), forKey: .ts)
        try c.encode(lat, forKey: .lat)
        try c.encode(lon, forKey: .lon)
        try c.encodeIfPresent(altitudeM, forKey: .altitudeM)
        try c.encodeIfPresent(velocityMs, forKey: .velocityMs)
        try c.encodeIfPresent(heading, forKey: .heading)
        try c.encodeIfPresent(onGround.map { $0 ? 1 : 0 }, forKey: .onGround)
    }
}
