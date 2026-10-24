export type TelemetrySnapshot = {
  capturedAtUtc: string;
  cpuUsagePercent: number | null;
  gpuName: string | null;
  gpuUsagePercent: number | null;
  gpuTemperatureCelsius: number | null;
  ramUsedBytes: number | null;
  ramTotalBytes: number | null;
};

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'paused';

function isOptionalNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

export function isTelemetrySnapshot(value: unknown): value is TelemetrySnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.capturedAtUtc === 'string' &&
    (typeof candidate.gpuName === 'string' || candidate.gpuName === null) &&
    isOptionalNumber(candidate.cpuUsagePercent) &&
    isOptionalNumber(candidate.gpuUsagePercent) &&
    isOptionalNumber(candidate.gpuTemperatureCelsius) &&
    isOptionalNumber(candidate.ramUsedBytes) &&
    isOptionalNumber(candidate.ramTotalBytes)
  );
}
