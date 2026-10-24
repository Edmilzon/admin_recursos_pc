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
    ulong? RamTotalBytes);
