using System.Runtime.InteropServices;
using System.Security.Principal;
using PanelPc.Agent.Models;

namespace PanelPc.Agent.Services;

/// <summary>
/// Lee CPU y memoria con APIs de Windows. No crea un temporizador: el agente
/// llama a Read únicamente mientras hay un panel conectado.
/// </summary>
internal sealed class SystemTelemetryReader : IDisposable
{
    private CpuCounters? _previousCpuCounters;
    private NvidiaGpuReader? _gpuReader;
    private bool _gpuReaderInitialized;
    private HardwareSensorReader? _hardwareSensorReader;
    private DiskTelemetryReader? _diskTelemetryReader;

    public void BeginSession()
    {
        _previousCpuCounters = null;
    }

    public TelemetrySnapshot Read()
    {
        var capturedAtUtc = DateTimeOffset.UtcNow;
        var cpuUsagePercent = ReadCpuUsagePercent();
        var (ramUsedBytes, ramTotalBytes) = ReadMemory();
        var gpu = GetGpuReader()?.Read();
        _hardwareSensorReader ??= new HardwareSensorReader();
        var hardware = _hardwareSensorReader.Read();
        _diskTelemetryReader ??= new DiskTelemetryReader();
        var disks = _diskTelemetryReader.Read(hardware.StorageReadings);

        var fans = hardware.FanReadings.ToList();
        if (gpu?.FanPercent is double gpuFanPercent)
        {
            fans.Add(new TelemetryReading("NVIDIA", "Ventilador GPU", gpuFanPercent, "%"));
        }

        return new TelemetrySnapshot(
            capturedAtUtc,
            cpuUsagePercent,
            gpu?.Name,
            gpu?.UsagePercent,
            gpu?.TemperatureCelsius,
            ramUsedBytes,
            ramTotalBytes,
            hardware.CpuName,
            Environment.ProcessorCount,
            hardware.CpuTemperatureCelsius,
            hardware.CpuClockMHz,
            hardware.MotherboardName,
            hardware.MotherboardTemperatureCelsius,
            hardware.MotherboardFanRpm,
            hardware.RamTemperatureCelsius,
            gpu?.MemoryUsedBytes,
            gpu?.MemoryTotalBytes,
            gpu?.ClockMHz,
            gpu?.FanPercent,
            hardware.MotherboardTemperatureSensors,
            hardware.CpuCoreReadings,
            fans,
            hardware.CpuClockReadings,
            gpu?.ClockReadings ?? [],
            disks,
            Environment.MachineName,
            RuntimeInformation.OSDescription,
            RuntimeInformation.OSArchitecture.ToString(),
            Environment.Version.ToString(),
            Math.Max(0, Environment.TickCount64 / 1000),
            new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator));
    }

    public void Dispose()
    {
        _gpuReader?.Dispose();
        _hardwareSensorReader?.Dispose();
        _diskTelemetryReader?.Dispose();
    }

    private double? ReadCpuUsagePercent()
    {
        if (!GetSystemTimes(out var idleTime, out var kernelTime, out var userTime))
        {
            return null;
        }

        var current = new CpuCounters(idleTime.ToUInt64(), kernelTime.ToUInt64(), userTime.ToUInt64());
        var previous = _previousCpuCounters;
        _previousCpuCounters = current;

        // The first read establishes the baseline; a percentage needs two samples.
        if (previous is null || current.Kernel < previous.Value.Kernel ||
            current.User < previous.Value.User || current.Idle < previous.Value.Idle)
        {
            return null;
        }

        var kernelDelta = current.Kernel - previous.Value.Kernel;
        var userDelta = current.User - previous.Value.User;
        var idleDelta = current.Idle - previous.Value.Idle;
        var totalDelta = kernelDelta + userDelta;

        if (totalDelta == 0 || idleDelta > totalDelta)
        {
            return null;
        }

        var usage = (double)(totalDelta - idleDelta) / totalDelta * 100d;
        return Math.Clamp(usage, 0d, 100d);
    }

    private static (ulong? Used, ulong? Total) ReadMemory()
    {
        var status = new MemoryStatusEx
        {
            Length = (uint)Marshal.SizeOf<MemoryStatusEx>(),
        };

        if (!GlobalMemoryStatusEx(ref status) || status.TotalPhysical == 0)
        {
            return (null, null);
        }

        return (status.TotalPhysical - status.AvailablePhysical, status.TotalPhysical);
    }

    private NvidiaGpuReader? GetGpuReader()
    {
        if (_gpuReaderInitialized)
        {
            return _gpuReader;
        }

        _gpuReaderInitialized = true;
        _gpuReader = NvidiaGpuReader.TryCreate();
        return _gpuReader;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSystemTimes(out FileTime idleTime, out FileTime kernelTime, out FileTime userTime);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx buffer);

    [StructLayout(LayoutKind.Sequential)]
    private struct FileTime
    {
        public uint LowDateTime;
        public uint HighDateTime;

        public ulong ToUInt64() => ((ulong)HighDateTime << 32) | LowDateTime;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MemoryStatusEx
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
    }

    private readonly record struct CpuCounters(ulong Idle, ulong Kernel, ulong User);
}
