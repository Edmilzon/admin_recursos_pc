using System.Runtime.InteropServices;
using System.Text;

namespace PanelPc.Agent.Services;

/// <summary>
/// Adaptador opcional para NVML. La DLL se carga en tiempo de ejecución, así
/// que el proyecto no necesita distribuir ni compilar contra una DLL de NVIDIA.
/// </summary>
internal sealed class NvidiaGpuReader : IDisposable
{
    private const int NvmlSuccess = 0;
    private const uint GpuTemperatureSensor = 0;

    private readonly IntPtr _library;
    private readonly IntPtr _device;
    private readonly NvmlShutdown _shutdown;
    private readonly DeviceGetUtilizationRates _getUtilizationRates;
    private readonly DeviceGetTemperature _getTemperature;
    private bool _disposed;

    private NvidiaGpuReader(
        IntPtr library,
        IntPtr device,
        NvmlShutdown shutdown,
        DeviceGetUtilizationRates getUtilizationRates,
        DeviceGetTemperature getTemperature,
        string? name)
    {
        _library = library;
        _device = device;
        _shutdown = shutdown;
        _getUtilizationRates = getUtilizationRates;
        _getTemperature = getTemperature;
        Name = name;
    }

    public string? Name { get; }

    public static NvidiaGpuReader? TryCreate()
    {
        var library = LoadNvmlLibrary();
        if (library == IntPtr.Zero)
        {
            return null;
        }

        NvmlShutdown? shutdown = null;
        var initialized = false;

        try
        {
            var initialize = GetExport<NvmlInit>(library, "nvmlInit_v2");
            shutdown = GetExport<NvmlShutdown>(library, "nvmlShutdown");
            var getDeviceCount = GetExport<DeviceGetCount>(library, "nvmlDeviceGetCount_v2");
            var getDeviceByIndex = GetExport<DeviceGetHandleByIndex>(library, "nvmlDeviceGetHandleByIndex_v2");
            var getName = GetExport<DeviceGetName>(library, "nvmlDeviceGetName");
            var getUtilizationRates = GetExport<DeviceGetUtilizationRates>(library, "nvmlDeviceGetUtilizationRates");
            var getTemperature = GetExport<DeviceGetTemperature>(library, "nvmlDeviceGetTemperature");

            if (initialize() != NvmlSuccess)
            {
                NativeLibrary.Free(library);
                return null;
            }

            initialized = true;
            if (getDeviceCount(out var deviceCount) != NvmlSuccess || deviceCount == 0 ||
                getDeviceByIndex(0, out var device) != NvmlSuccess)
            {
                shutdown();
                NativeLibrary.Free(library);
                return null;
            }

            var nameBuffer = new byte[128];
            string? name = null;
            if (getName(device, nameBuffer, (uint)nameBuffer.Length) == NvmlSuccess)
            {
                var terminator = Array.IndexOf(nameBuffer, (byte)0);
                var nameLength = terminator < 0 ? nameBuffer.Length : terminator;
                name = Encoding.UTF8.GetString(nameBuffer, 0, nameLength);
            }

            return new NvidiaGpuReader(
                library,
                device,
                shutdown,
                getUtilizationRates,
                getTemperature,
                name);
        }
        catch (Exception) when (initialized || library != IntPtr.Zero)
        {
            if (initialized)
            {
                try
                {
                    shutdown?.Invoke();
                }
                catch (Exception)
                {
                    // NVML is optional; a driver error should not stop CPU/RAM monitoring.
                }
            }

            NativeLibrary.Free(library);
            return null;
        }
    }

    public GpuMetrics Read()
    {
        double? usagePercent = _getUtilizationRates(_device, out var utilization) == NvmlSuccess
            ? utilization.Gpu
            : null;

        double? temperatureCelsius = _getTemperature(_device, GpuTemperatureSensor, out var temperature) == NvmlSuccess
            ? temperature
            : null;

        return new GpuMetrics(Name, usagePercent, temperatureCelsius);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        try
        {
            _shutdown();
        }
        finally
        {
            NativeLibrary.Free(_library);
        }
    }

    private static IntPtr LoadNvmlLibrary()
    {
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var candidates = new[]
        {
            Path.Combine(programFiles, "NVIDIA Corporation", "NVSMI", "nvml.dll"),
            Path.Combine(Environment.SystemDirectory, "nvml.dll"),
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate) && NativeLibrary.TryLoad(candidate, out var library))
            {
                return library;
            }
        }

        return NativeLibrary.TryLoad("nvml.dll", out var fallback) ? fallback : IntPtr.Zero;
    }

    private static T GetExport<T>(IntPtr library, string name) where T : Delegate =>
        Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(library, name));

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int NvmlInit();

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int NvmlShutdown();

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int DeviceGetCount(out uint deviceCount);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int DeviceGetHandleByIndex(uint index, out IntPtr device);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int DeviceGetName(IntPtr device, [Out] byte[] name, uint length);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int DeviceGetUtilizationRates(IntPtr device, out NvmlUtilization utilization);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int DeviceGetTemperature(IntPtr device, uint sensorType, out uint temperature);

    [StructLayout(LayoutKind.Sequential)]
    private struct NvmlUtilization
    {
        public uint Gpu;
        public uint Memory;
    }
}

internal sealed record GpuMetrics(string? Name, double? UsagePercent, double? TemperatureCelsius);
