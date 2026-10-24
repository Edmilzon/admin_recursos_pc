using System.Diagnostics;
using System.Management;
using System.Text.RegularExpressions;
using PanelPc.Agent.Models;

namespace PanelPc.Agent.Services;

/// <summary>
/// Captures a small cached inventory of physical disks and updates their
/// volume capacity and Windows physical-disk I/O counters while a client is connected.
/// </summary>
internal sealed class DiskTelemetryReader : IDisposable
{
    private static readonly Regex PartitionPattern = new(@"Disk\s*#(?<disk>\d+),\s*Partition\s*#(?<partition>\d+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex VolumePattern = new(@"DeviceID\s*=\s*""(?<drive>[A-Z]:)""", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly IReadOnlyList<DiskDefinition> _disks;
    private readonly Dictionary<int, DiskCounters[]> _counters;

    public DiskTelemetryReader()
    {
        _disks = LoadDiskInventory();
        _counters = LoadCounters(_disks);
    }

    public IReadOnlyList<DiskTelemetry> Read(IReadOnlyList<TelemetryReading> storageReadings)
    {
        var volumes = ReadReadyVolumes();
        return _disks.Select(disk =>
        {
            var diskVolumes = disk.VolumeIds
                .Select(id => volumes.TryGetValue(id, out var volume) ? volume : null)
                .Where(volume => volume is not null)
                .Cast<DiskVolumeTelemetry>()
                .ToArray();
            var usedBytes = diskVolumes.Length == 0 ? null : (ulong?)diskVolumes.Aggregate(0UL, (total, volume) => total + volume.UsedBytes);
            var matchedSensors = storageReadings
                .Where(reading => HardwareNameMatches(disk.Model, reading.Hardware))
                .ToArray();
            var temperature = matchedSensors
                .Where(reading => reading.Unit == "°C" && IsValidNonNegative(reading.Value))
                .OrderBy(reading => TemperaturePriority(reading.Name))
                .Select(reading => (double?)reading.Value)
                .FirstOrDefault();
            var life = matchedSensors
                .Where(reading => reading.Unit == "%" && IsValidPercent(reading.Value) &&
                    (reading.Name.Contains("life", StringComparison.OrdinalIgnoreCase) ||
                     reading.Name.Contains("health", StringComparison.OrdinalIgnoreCase) ||
                     reading.Name.Contains("wear", StringComparison.OrdinalIgnoreCase)))
                .Select(reading => (double?)reading.Value)
                .FirstOrDefault();
            var (readRate, writeRate, activeTime) = ReadRates(disk.Number);

            return new DiskTelemetry(
                disk.Number,
                disk.Model,
                disk.BusType,
                disk.MediaType,
                disk.HealthStatus,
                disk.CapacityBytes,
                usedBytes,
                readRate,
                writeRate,
                activeTime,
                temperature,
                life,
                diskVolumes);
        }).ToArray();
    }

    public void Dispose()
    {
        foreach (var counters in _counters.Values.SelectMany(value => value))
        {
            counters.Dispose();
        }
    }

    private static IReadOnlyList<DiskDefinition> LoadDiskInventory()
    {
        try
        {
            var partitionByDisk = new Dictionary<int, List<string>>();
            using (var searcher = new ManagementObjectSearcher("SELECT Antecedent, Dependent FROM Win32_DiskDriveToDiskPartition"))
            using (var results = searcher.Get())
            {
                foreach (ManagementObject association in results)
                {
                    using (association)
                    {
                        var diskMatch = Regex.Match(association["Antecedent"]?.ToString() ?? string.Empty, "PHYSICALDRIVE(?<disk>\\d+)", RegexOptions.IgnoreCase);
                        var partitionMatch = PartitionPattern.Match(association["Dependent"]?.ToString() ?? string.Empty);
                        if (diskMatch.Success && partitionMatch.Success &&
                            int.TryParse(diskMatch.Groups["disk"].Value, out var diskNumber) &&
                            int.TryParse(partitionMatch.Groups["partition"].Value, out var partitionNumber))
                        {
                            var key = $"{diskNumber}:{partitionNumber}";
                            if (!partitionByDisk.TryGetValue(diskNumber, out var partitions))
                            {
                                partitions = [];
                                partitionByDisk[diskNumber] = partitions;
                            }

                            partitions.Add(key);
                        }
                    }
                }
            }

            var volumesByPartition = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            using (var searcher = new ManagementObjectSearcher("SELECT Antecedent, Dependent FROM Win32_LogicalDiskToPartition"))
            using (var results = searcher.Get())
            {
                foreach (ManagementObject association in results)
                {
                    using (association)
                    {
                        var partitionMatch = PartitionPattern.Match(association["Antecedent"]?.ToString() ?? string.Empty);
                        var volumeMatch = VolumePattern.Match(association["Dependent"]?.ToString() ?? string.Empty);
                        if (partitionMatch.Success && volumeMatch.Success &&
                            int.TryParse(partitionMatch.Groups["disk"].Value, out var diskNumber) &&
                            int.TryParse(partitionMatch.Groups["partition"].Value, out var partitionNumber))
                        {
                            var key = $"{diskNumber}:{partitionNumber}";
                            if (!volumesByPartition.TryGetValue(key, out var driveIds))
                            {
                                driveIds = [];
                                volumesByPartition[key] = driveIds;
                            }

                            driveIds.Add(volumeMatch.Groups["drive"].Value.ToUpperInvariant());
                        }
                    }
                }
            }

            var volumesForDisk = partitionByDisk.ToDictionary(
                pair => pair.Key,
                pair => pair.Value.SelectMany(partition => volumesByPartition.TryGetValue(partition, out var drives) ? drives : [])
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray());
            var physicalDetails = LoadPhysicalDiskDetails();
            var definitions = new List<DiskDefinition>();

            using var diskSearcher = new ManagementObjectSearcher("SELECT Index, Model, InterfaceType, MediaType, Size, Status, PNPDeviceID FROM Win32_DiskDrive");
            using var disks = diskSearcher.Get();
            foreach (ManagementObject drive in disks)
            {
                using (drive)
                {
                    if (!int.TryParse(drive["Index"]?.ToString(), out var number)) continue;
                    var model = drive["Model"]?.ToString()?.Trim();
                    if (string.IsNullOrWhiteSpace(model)) model = $"Disco físico {number}";
                    var pnpId = drive["PNPDeviceID"]?.ToString() ?? string.Empty;
                    var interfaceType = drive["InterfaceType"]?.ToString() ?? string.Empty;
                    var size = TryUInt64(drive["Size"]);
                    var fallbackBus = pnpId.Contains("NVME", StringComparison.OrdinalIgnoreCase) ? "NVMe" :
                        pnpId.Contains("USB", StringComparison.OrdinalIgnoreCase) ? "USB" :
                        interfaceType.Equals("IDE", StringComparison.OrdinalIgnoreCase) ? "SATA" :
                        string.IsNullOrWhiteSpace(interfaceType) ? "Desconocido" : interfaceType;
                    var physical = physicalDetails.GetValueOrDefault(number);
                    var volumeIds = volumesForDisk.GetValueOrDefault(number) ?? [];
                    definitions.Add(new DiskDefinition(
                        number,
                        model,
                        physical?.BusType ?? fallbackBus,
                        physical?.MediaType ?? SimplifyMediaType(drive["MediaType"]?.ToString(), pnpId),
                        physical?.HealthStatus ?? (drive["Status"]?.ToString() ?? "Sin estado"),
                        size,
                        volumeIds));
                }
            }

            return definitions.OrderBy(disk => disk.Number).ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static Dictionary<int, PhysicalDiskDetail> LoadPhysicalDiskDetails()
    {
        var details = new Dictionary<int, PhysicalDiskDetail>();
        try
        {
            var scope = new ManagementScope(@"\\.\ROOT\Microsoft\Windows\Storage");
            scope.Connect();
            using var searcher = new ManagementObjectSearcher(scope, new ObjectQuery(
                "SELECT DeviceId, MediaType, BusType, HealthStatus FROM MSFT_PhysicalDisk"));
            using var disks = searcher.Get();
            foreach (ManagementObject disk in disks)
            {
                using (disk)
                {
                    if (!int.TryParse(disk["DeviceId"]?.ToString(), out var id)) continue;
                    details[id] = new PhysicalDiskDetail(
                        BusTypeName(disk["BusType"]),
                        MediaTypeName(disk["MediaType"]),
                        HealthStatusName(disk["HealthStatus"]));
                }
            }
        }
        catch
        {
            // Win32_DiskDrive remains as a compatible fallback on older Windows builds.
        }

        return details;
    }

    private static Dictionary<string, DiskVolumeTelemetry> ReadReadyVolumes()
    {
        var volumes = new Dictionary<string, DiskVolumeTelemetry>(StringComparer.OrdinalIgnoreCase);
        foreach (var drive in DriveInfo.GetDrives())
        {
            try
            {
                if (!drive.IsReady || drive.DriveType != DriveType.Fixed) continue;
                var deviceId = drive.Name.TrimEnd('\\').ToUpperInvariant();
                var total = (ulong)Math.Max(0, drive.TotalSize);
                var available = (ulong)Math.Max(0, drive.AvailableFreeSpace);
                volumes[deviceId] = new DiskVolumeTelemetry(
                    deviceId,
                    string.IsNullOrWhiteSpace(drive.VolumeLabel) ? null : drive.VolumeLabel,
                    drive.DriveFormat,
                    total,
                    total >= available ? total - available : 0,
                    available);
            }
            catch
            {
                // A disconnected or inaccessible volume is omitted until the next snapshot.
            }
        }

        return volumes;
    }

    private static Dictionary<int, DiskCounters[]> LoadCounters(IReadOnlyList<DiskDefinition> disks)
    {
        var output = new Dictionary<int, DiskCounters[]>();
        try
        {
            var instances = new PerformanceCounterCategory("PhysicalDisk").GetInstanceNames();
            foreach (var disk in disks)
            {
                var prefix = $"{disk.Number} ";
                var diskInstances = instances
                    .Where(instance => instance.Equals(disk.Number.ToString(), StringComparison.OrdinalIgnoreCase) ||
                        instance.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    .Where(instance => !instance.Equals("_Total", StringComparison.OrdinalIgnoreCase))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
                var counters = new List<DiskCounters>();
                foreach (var instance in diskInstances)
                {
                    try
                    {
                        counters.Add(new DiskCounters(
                            new PerformanceCounter("PhysicalDisk", "Disk Read Bytes/sec", instance, readOnly: true),
                            new PerformanceCounter("PhysicalDisk", "Disk Write Bytes/sec", instance, readOnly: true),
                            new PerformanceCounter("PhysicalDisk", "% Disk Time", instance, readOnly: true)));
                    }
                    catch
                    {
                        // Counter support varies by storage driver.
                    }
                }

                output[disk.Number] = counters.ToArray();
            }
        }
        catch
        {
            // Capacity, drive status and temperature are still useful without perf counters.
        }

        return output;
    }

    private (double? Read, double? Write, double? ActiveTime) ReadRates(int diskNumber)
    {
        if (!_counters.TryGetValue(diskNumber, out var counters) || counters.Length == 0) return (null, null, null);
        double read = 0;
        double write = 0;
        double activeTime = 0;
        var hasRead = false;
        var hasWrite = false;
        var hasActiveTime = false;
        foreach (var counter in counters)
        {
            try
            {
                read += Math.Max(0, counter.Read.NextValue());
                hasRead = true;
            }
            catch
            {
                // Retain available counters for the remaining drives.
            }

            try
            {
                write += Math.Max(0, counter.Write.NextValue());
                hasWrite = true;
            }
            catch
            {
                // Retain available counters for the remaining drives.
            }

            try
            {
                var value = counter.ActiveTime.NextValue();
                if (double.IsFinite(value))
                {
                    activeTime = Math.Max(activeTime, value);
                    hasActiveTime = true;
                }
            }
            catch
            {
                // This counter is not available on every storage driver.
            }
        }

        return (hasRead ? read : null, hasWrite ? write : null,
            hasActiveTime ? Math.Clamp(activeTime, 0, 100) : null);
    }

    private static bool HardwareNameMatches(string model, string hardware) =>
        model.Contains(hardware, StringComparison.OrdinalIgnoreCase) ||
        hardware.Contains(model, StringComparison.OrdinalIgnoreCase) ||
        model.Split(' ', StringSplitOptions.RemoveEmptyEntries).Any(token => token.Length >= 6 && hardware.Contains(token, StringComparison.OrdinalIgnoreCase));

    private static int TemperaturePriority(string name) =>
        name.Contains("composite", StringComparison.OrdinalIgnoreCase) ? 0 :
        name.Equals("Temperature", StringComparison.OrdinalIgnoreCase) ? 1 : 2;

    private static bool IsValidNonNegative(double value) => double.IsFinite(value) && value >= 0;

    private static bool IsValidPercent(double value) => double.IsFinite(value) && value is >= 0 and <= 100;

    private static ulong? TryUInt64(object? value)
    {
        try { return value is null ? null : Convert.ToUInt64(value); }
        catch { return null; }
    }

    private static string SimplifyMediaType(string? mediaType, string pnpId)
    {
        if (pnpId.Contains("NVME", StringComparison.OrdinalIgnoreCase)) return "SSD";
        if (mediaType?.Contains("removable", StringComparison.OrdinalIgnoreCase) == true) return "Extraíble";
        return "Disco fijo";
    }

    private static string BusTypeName(object? value) => Convert.ToInt32(value ?? 0) switch
    {
        1 => "SCSI", 2 => "ATAPI", 3 => "ATA", 7 => "USB", 8 => "RAID", 9 => "iSCSI",
        10 => "SAS", 11 => "SATA", 14 => "Virtual", 17 => "NVMe", 18 => "SCM", 19 => "UFS",
        _ => "Desconocido",
    };

    private static string MediaTypeName(object? value) => Convert.ToInt32(value ?? 0) switch
    {
        3 => "HDD", 4 => "SSD", 5 => "SCM", _ => "Unidad",
    };

    private static string HealthStatusName(object? value) => Convert.ToInt32(value ?? 5) switch
    {
        0 => "Saludable", 1 => "Advertencia", 2 => "No saludable", _ => "Sin dato",
    };

    private sealed record DiskDefinition(int Number, string Model, string BusType, string MediaType,
        string HealthStatus, ulong? CapacityBytes, IReadOnlyList<string> VolumeIds);

    private sealed record PhysicalDiskDetail(string BusType, string MediaType, string HealthStatus);

    private sealed record DiskCounters(PerformanceCounter Read, PerformanceCounter Write, PerformanceCounter ActiveTime) : IDisposable
    {
        public void Dispose()
        {
            Read.Dispose();
            Write.Dispose();
            ActiveTime.Dispose();
        }
    }
}
