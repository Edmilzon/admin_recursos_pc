export type TelemetrySnapshot = {
  capturedAtUtc: string;
  cpuUsagePercent: number | null;
  gpuName: string | null;
  gpuUsagePercent: number | null;
  gpuTemperatureCelsius: number | null;
  ramUsedBytes: number | null;
  ramTotalBytes: number | null;
  cpuName: string | null;
  cpuLogicalProcessorCount: number;
  cpuTemperatureCelsius: number | null;
  cpuClockMHz: number | null;
  motherboardName: string | null;
  motherboardTemperatureCelsius: number | null;
  motherboardFanRpm: number | null;
  ramTemperatureCelsius: number | null;
  gpuMemoryUsedBytes: number | null;
  gpuMemoryTotalBytes: number | null;
  gpuClockMHz: number | null;
  gpuFanPercent: number | null;
  motherboardTemperatureSensors: TelemetryReading[];
  cpuCoreReadings: TelemetryReading[];
  fanReadings: TelemetryReading[];
  cpuClockReadings: TelemetryReading[];
  gpuClockReadings: TelemetryReading[];
  disks: DiskTelemetry[];
  computerName: string;
  osName: string;
  osArchitecture: string;
  dotNetVersion: string;
  systemUptimeSeconds: number;
  agentIsElevated: boolean;
};

export type TelemetryReading = {
  hardware: string;
  name: string;
  value: number;
  unit: string;
  maxValue?: number | null;
};

export type DiskTelemetry = {
  number: number;
  model: string;
  busType: string;
  mediaType: string;
  healthStatus: string;
  capacityBytes: number | null;
  usedBytes: number | null;
  readBytesPerSecond: number | null;
  writeBytesPerSecond: number | null;
  activeTimePercent?: number | null;
  temperatureCelsius: number | null;
  lifePercent: number | null;
  volumes: DiskVolumeTelemetry[];
};

export type DiskVolumeTelemetry = {
  deviceId: string;
  label: string | null;
  fileSystem: string | null;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
};

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'paused';

function isOptionalNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isReadingArray(value: unknown): value is TelemetryReading[] {
  return Array.isArray(value) && value.every(reading =>
    typeof reading === 'object' && reading !== null &&
    typeof reading.hardware === 'string' && typeof reading.name === 'string' &&
    typeof reading.value === 'number' && Number.isFinite(reading.value) &&
    typeof reading.unit === 'string' &&
    (reading.maxValue === undefined || reading.maxValue === null || (typeof reading.maxValue === 'number' && Number.isFinite(reading.maxValue))));
}

function isDiskArray(value: unknown): value is DiskTelemetry[] {
  return Array.isArray(value) && value.every(disk => {
    if (typeof disk !== 'object' || disk === null) return false;
    const candidate = disk as Record<string, unknown>;
    return Number.isInteger(candidate.number) &&
      typeof candidate.model === 'string' && typeof candidate.busType === 'string' &&
      typeof candidate.mediaType === 'string' && typeof candidate.healthStatus === 'string' &&
      isOptionalNumber(candidate.capacityBytes) && isOptionalNumber(candidate.usedBytes) &&
      isOptionalNumber(candidate.readBytesPerSecond) && isOptionalNumber(candidate.writeBytesPerSecond) &&
      (candidate.activeTimePercent === undefined || isOptionalNumber(candidate.activeTimePercent)) &&
      isOptionalNumber(candidate.temperatureCelsius) && isOptionalNumber(candidate.lifePercent) &&
      Array.isArray(candidate.volumes) && candidate.volumes.every(volume => {
        if (typeof volume !== 'object' || volume === null) return false;
        const item = volume as Record<string, unknown>;
        return typeof item.deviceId === 'string' &&
          (typeof item.label === 'string' || item.label === null) &&
          (typeof item.fileSystem === 'string' || item.fileSystem === null) &&
          isOptionalNumber(item.totalBytes) && isOptionalNumber(item.usedBytes) && isOptionalNumber(item.availableBytes);
      });
  });
}

export function isTelemetrySnapshot(value: unknown): value is TelemetrySnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.capturedAtUtc === 'string' &&
    (typeof candidate.gpuName === 'string' || candidate.gpuName === null) &&
    (typeof candidate.cpuName === 'string' || candidate.cpuName === null) &&
    Number.isInteger(candidate.cpuLogicalProcessorCount) &&
    (typeof candidate.motherboardName === 'string' || candidate.motherboardName === null) &&
    typeof candidate.computerName === 'string' &&
    typeof candidate.osName === 'string' &&
    typeof candidate.osArchitecture === 'string' &&
    typeof candidate.dotNetVersion === 'string' &&
    Number.isFinite(candidate.systemUptimeSeconds) &&
    typeof candidate.agentIsElevated === 'boolean' &&
    isReadingArray(candidate.motherboardTemperatureSensors) &&
    isReadingArray(candidate.cpuCoreReadings) &&
    isReadingArray(candidate.fanReadings) &&
    isReadingArray(candidate.cpuClockReadings) &&
    isReadingArray(candidate.gpuClockReadings) &&
    isDiskArray(candidate.disks) &&
    isOptionalNumber(candidate.cpuUsagePercent) &&
    isOptionalNumber(candidate.cpuTemperatureCelsius) &&
    isOptionalNumber(candidate.cpuClockMHz) &&
    isOptionalNumber(candidate.gpuUsagePercent) &&
    isOptionalNumber(candidate.gpuTemperatureCelsius) &&
    isOptionalNumber(candidate.motherboardTemperatureCelsius) &&
    isOptionalNumber(candidate.motherboardFanRpm) &&
    isOptionalNumber(candidate.ramTemperatureCelsius) &&
    isOptionalNumber(candidate.ramUsedBytes) &&
    isOptionalNumber(candidate.ramTotalBytes) &&
    isOptionalNumber(candidate.gpuMemoryUsedBytes) &&
    isOptionalNumber(candidate.gpuMemoryTotalBytes) &&
    isOptionalNumber(candidate.gpuClockMHz) &&
    isOptionalNumber(candidate.gpuFanPercent)
  );
}
