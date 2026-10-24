namespace PanelPc.Agent.Models;

/// <summary>
/// Lecturas de la PC que el agente enviará al panel Android.
/// Los valores nulos indican que todavía no hay una lectura disponible.
/// </summary>
public sealed record TelemetrySnapshot(
    DateTimeOffset CapturedAtUtc,
    double? CpuUsagePercent,
    string? GpuName,
    double? GpuUsagePercent,
    double? GpuTemperatureCelsius,
    ulong? RamUsedBytes,
    ulong? RamTotalBytes,
    string? CpuName,
    int CpuLogicalProcessorCount,
    double? CpuTemperatureCelsius,
    double? CpuClockMHz,
    string? MotherboardName,
    double? MotherboardTemperatureCelsius,
    double? MotherboardFanRpm,
    double? RamTemperatureCelsius,
    ulong? GpuMemoryUsedBytes,
    ulong? GpuMemoryTotalBytes,
    double? GpuClockMHz,
    double? GpuFanPercent,
    IReadOnlyList<TelemetryReading> MotherboardTemperatureSensors,
    IReadOnlyList<TelemetryReading> CpuCoreReadings,
    IReadOnlyList<TelemetryReading> FanReadings,
    IReadOnlyList<TelemetryReading> CpuClockReadings,
    IReadOnlyList<TelemetryReading> GpuClockReadings,
    IReadOnlyList<DiskTelemetry> Disks,
    string ComputerName,
    string OsName,
    string OsArchitecture,
    string DotNetVersion,
    long SystemUptimeSeconds,
    bool AgentIsElevated);

public sealed record TelemetryReading(string Hardware, string Name, double Value, string Unit, double? MaxValue = null);

public sealed record DiskTelemetry(
    int Number,
    string Model,
    string BusType,
    string MediaType,
    string HealthStatus,
    ulong? CapacityBytes,
    ulong? UsedBytes,
    double? ReadBytesPerSecond,
    double? WriteBytesPerSecond,
    double? ActiveTimePercent,
    double? TemperatureCelsius,
    double? LifePercent,
    IReadOnlyList<DiskVolumeTelemetry> Volumes);

public sealed record DiskVolumeTelemetry(
    string DeviceId,
    string? Label,
    string? FileSystem,
    ulong TotalBytes,
    ulong UsedBytes,
    ulong AvailableBytes);
