using LibreHardwareMonitor.Hardware;
using PanelPc.Agent.Models;

namespace PanelPc.Agent.Services;

/// <summary>
/// Lee los sensores que el procesador y la placa exponen al sistema. Muchos
/// equipos no publican CPU/RAM por temperatura; esos valores permanecen nulos.
/// </summary>
internal sealed class HardwareSensorReader : IDisposable
{
    private readonly Computer _computer = new()
    {
        IsCpuEnabled = true,
        IsMotherboardEnabled = true,
        IsMemoryEnabled = true,
        IsStorageEnabled = true,
        IsControllerEnabled = true,
    };

    private bool _opened;

    public HardwareSensorReader()
    {
        try
        {
            _computer.Open();
            _opened = true;
        }
        catch
        {
            // La lectura del hardware es opcional; CPU/RAM básicas siguen disponibles.
        }
    }

    public HardwareSensorMetrics Read()
    {
        if (!_opened)
        {
            return HardwareSensorMetrics.Empty;
        }

        try
        {
            _computer.Accept(new RefreshVisitor());
            var hardware = Flatten(_computer.Hardware).ToArray();
            var cpu = hardware.FirstOrDefault(item => item.HardwareType == HardwareType.Cpu);
            var motherboard = hardware.FirstOrDefault(item => item.HardwareType == HardwareType.Motherboard);
            var memory = hardware.FirstOrDefault(item => item.HardwareType == HardwareType.Memory);

            var cpuSensors = cpu is null ? [] : FlattenSensors(cpu);
            var boardSensors = hardware
                .Where(item => item.HardwareType is HardwareType.Motherboard or HardwareType.SuperIO)
                .SelectMany(FlattenSensors)
                .ToArray();
            var memorySensors = memory is null ? [] : FlattenSensors(memory);
            var storageReadings = hardware
                .Where(item => item.HardwareType == HardwareType.Storage)
                .SelectMany(item => item.Sensors
                    .Where(sensor => sensor.Value is float value && float.IsFinite(value) &&
                        (sensor.SensorType == SensorType.Temperature ||
                         (sensor.SensorType is SensorType.Level or SensorType.Load) && value is >= 0 and <= 100))
                    .Select(sensor => new TelemetryReading(item.Name, sensor.Name, sensor.Value!.Value,
                        sensor.SensorType == SensorType.Temperature ? "°C" : "%")))
                .DistinctBy(reading => $"{reading.Hardware}|{reading.Name}")
                .ToArray();
            var temperatureReadings = hardware
                .Where(item => item.HardwareType is HardwareType.Motherboard or HardwareType.SuperIO)
                .SelectMany(item => item.Sensors
                    .Where(sensor => sensor.SensorType == SensorType.Temperature && IsPositiveReading(sensor.Value))
                    .Select(sensor => new TelemetryReading(item.Name, sensor.Name, sensor.Value!.Value, "°C")))
                .DistinctBy(reading => $"{reading.Hardware}|{reading.Name}")
                .ToArray();
            var cpuCoreReadings = cpu is null ? [] : FlattenSensors(cpu)
                .Where(sensor => (sensor.SensorType == SensorType.Load ? IsFiniteNonNegative(sensor.Value) :
                        sensor.SensorType == SensorType.Temperature && IsPositiveReading(sensor.Value)) &&
                    (sensor.Name.Contains("core", StringComparison.OrdinalIgnoreCase) ||
                     sensor.Name.Contains("ccd", StringComparison.OrdinalIgnoreCase) ||
                     sensor.Name.Contains("tctl", StringComparison.OrdinalIgnoreCase) ||
                     sensor.Name.Contains("tdie", StringComparison.OrdinalIgnoreCase) ||
                     sensor.Name.Contains("package", StringComparison.OrdinalIgnoreCase)))
                .Select(sensor => new TelemetryReading(cpu.Name, sensor.Name, sensor.Value!.Value,
                    sensor.SensorType == SensorType.Load ? "%" : "°C",
                    sensor.SensorType == SensorType.Temperature ? ReadSensorMaximum(sensor) : null))
                .OrderBy(reading => CpuReadingPriority(reading.Name, reading.Unit))
                .DistinctBy(reading => $"{reading.Name}|{reading.Unit}")
                .ToArray();
            var fanReadings = hardware
                .SelectMany(item => item.Sensors
                    .Where(sensor => sensor.SensorType == SensorType.Fan && IsFiniteNonNegative(sensor.Value))
                    .Select(sensor => new TelemetryReading(
                        $"{FanHardwareLabel(item.HardwareType)} · {item.Name}",
                        sensor.Name,
                        sensor.Value!.Value,
                        "RPM",
                        ReadSensorMaximum(sensor))))
                .DistinctBy(reading => $"{reading.Hardware}|{reading.Name}")
                .ToArray();
            var cpuClockReadings = cpu is null ? [] : FlattenSensors(cpu)
                .Where(sensor => sensor.SensorType == SensorType.Clock && IsPositiveReading(sensor.Value))
                .Select(sensor => new TelemetryReading(cpu.Name, sensor.Name, sensor.Value!.Value, "MHz"))
                .DistinctBy(reading => reading.Name)
                .ToArray();

            return new HardwareSensorMetrics(
                cpu?.Name,
                FirstValue(cpuSensors, SensorType.Temperature, "package", "tctl", "tdie") ??
                    FirstValue(cpuSensors, SensorType.Temperature),
                AverageValue(cpuSensors, SensorType.Clock),
                motherboard?.Name,
                FirstValue(boardSensors, SensorType.Temperature, "motherboard", "system", "board"),
                AverageValue(boardSensors, SensorType.Fan),
                FirstValue(memorySensors, SensorType.Temperature) ??
                    FirstValue(boardSensors, SensorType.Temperature, "memory", "dram", "dimm", "ram"),
                temperatureReadings,
                cpuCoreReadings,
                fanReadings,
                cpuClockReadings,
                storageReadings);
        }
        catch
        {
            // A driver can deny individual sensor access; never interrupt telemetry.
            return HardwareSensorMetrics.Empty;
        }
    }

    public void Dispose()
    {
        if (!_opened)
        {
            return;
        }

        try
        {
            _computer.Close();
        }
        catch
        {
            // Sensor cleanup is best-effort.
        }
    }

    private static IEnumerable<IHardware> Flatten(IEnumerable<IHardware> hardware)
    {
        foreach (var item in hardware)
        {
            yield return item;
            foreach (var child in Flatten(item.SubHardware))
            {
                yield return child;
            }
        }
    }

    private static IEnumerable<ISensor> FlattenSensors(IHardware hardware) =>
        hardware.Sensors.Concat(hardware.SubHardware.SelectMany(FlattenSensors));

    private static double? FirstValue(IEnumerable<ISensor> sensors, SensorType type, params string[] nameHints)
    {
        var candidates = sensors.Where(sensor =>
            sensor.SensorType == type && IsPositiveReading(sensor.Value));
        if (nameHints.Length > 0)
        {
            candidates = candidates.OrderByDescending(sensor =>
                nameHints.Any(hint => sensor.Name.Contains(hint, StringComparison.OrdinalIgnoreCase)));
        }

        return candidates.Select(sensor => (double?)sensor.Value).FirstOrDefault();
    }

    private static double? AverageValue(IEnumerable<ISensor> sensors, SensorType type)
    {
        var values = sensors
            .Where(sensor => sensor.SensorType == type &&
                (type == SensorType.Fan ? IsFiniteNonNegative(sensor.Value) : IsPositiveReading(sensor.Value)))
            .Select(sensor => (double)sensor.Value!.Value)
            .ToArray();

        return values.Length == 0 ? null : values.Average();
    }

    private static bool IsPositiveReading(float? value) => value.HasValue && float.IsFinite(value.Value) && value.Value > 0f;

    private static bool IsFiniteNonNegative(float? value) => value.HasValue && float.IsFinite(value.Value) && value.Value >= 0f;

    private static double? ReadSensorMaximum(ISensor sensor)
    {
        // Es el máximo registrado por LHM, no el máximo nominal del fabricante.
        var value = sensor.GetType().GetProperty("Max")?.GetValue(sensor);
        return value is float maximum && float.IsFinite(maximum) ? maximum : null;
    }

    private static string FanHardwareLabel(HardwareType hardwareType) => hardwareType switch
    {
        HardwareType.Cpu => "CPU",
        HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel => "GPU",
        HardwareType.Motherboard => "PLACA",
        HardwareType.SuperIO => "PLACA / CONTROLADOR",
        _ => hardwareType.ToString().ToUpperInvariant(),
    };

    private static int CpuReadingPriority(string name, string unit)
    {
        if (unit == "°C" && name.Contains("core", StringComparison.OrdinalIgnoreCase) &&
            name.Contains("max", StringComparison.OrdinalIgnoreCase)) return 0;
        if (unit == "°C" && (name.Contains("tctl", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("tdie", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("package", StringComparison.OrdinalIgnoreCase))) return 1;
        if (unit == "°C" && name.Contains("ccd", StringComparison.OrdinalIgnoreCase)) return 2;
        return 3;
    }

    private sealed class RefreshVisitor : IVisitor
    {
        public void VisitComputer(IComputer computer) => computer.Traverse(this);

        public void VisitHardware(IHardware hardware)
        {
            hardware.Update();
            foreach (var subHardware in hardware.SubHardware)
            {
                subHardware.Accept(this);
            }
        }

        public void VisitSensor(ISensor sensor) { }

        public void VisitParameter(IParameter parameter) { }
    }
}

internal sealed record HardwareSensorMetrics(
    string? CpuName,
    double? CpuTemperatureCelsius,
    double? CpuClockMHz,
    string? MotherboardName,
    double? MotherboardTemperatureCelsius,
    double? MotherboardFanRpm,
    double? RamTemperatureCelsius,
    IReadOnlyList<TelemetryReading> MotherboardTemperatureSensors,
    IReadOnlyList<TelemetryReading> CpuCoreReadings,
    IReadOnlyList<TelemetryReading> FanReadings,
    IReadOnlyList<TelemetryReading> CpuClockReadings,
    IReadOnlyList<TelemetryReading> StorageReadings)
{
    public static HardwareSensorMetrics Empty { get; } = new(null, null, null, null, null, null, null, [], [], [], [], []);
}
