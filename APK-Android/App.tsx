import {useTelemetry} from './src/hooks/useTelemetry';
import type {ConnectionState} from './src/types/telemetry';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type MetricCardProps = {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  accent?: string;
};

function MetricCard({
  label,
  value,
  unit,
  detail,
  accent = '#58D6AE',
}: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricAccent, {backgroundColor: accent}]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      <Text numberOfLines={2} style={styles.metricDetail}>
        {detail}
      </Text>
    </View>
  );
}

function formatPercent(value: number | null | undefined) {
  return value == null ? '—' : `${Math.round(value)}`;
}

function formatGiB(value: number | null | undefined) {
  return value == null ? '—' : (value / 1024 ** 3).toFixed(1);
}

function connectionLabel(state: ConnectionState) {
  switch (state) {
    case 'connected':
      return 'CONECTADO';
    case 'connecting':
      return 'CONECTANDO';
    case 'paused':
      return 'EN PAUSA';
    default:
      return 'SIN CONEXIÓN';
  }
}

function App() {
  const {connectionState, snapshot} = useTelemetry();
  const isConnected = connectionState === 'connected';
  const cpuDetail = snapshot
    ? 'Uso general del procesador'
    : 'Esperando lectura de Windows';
  const gpuDetail = snapshot
    ? snapshot.gpuName ?? 'GPU o lectura NVML no disponible'
    : 'Esperando lectura de Windows';
  const temperatureDetail = snapshot
    ? snapshot.gpuTemperatureCelsius == null
      ? 'Sensor no disponible en NVML'
      : 'Temperatura reportada por NVML'
    : 'Esperando lectura de Windows';
  const ramUsed = snapshot?.ramUsedBytes;
  const ramTotal = snapshot?.ramTotalBytes;
  const ramPercent =
    ramUsed != null && ramTotal != null && ramTotal > 0
      ? Math.round((ramUsed / ramTotal) * 100)
      : null;
  const ramDetail =
    ramPercent == null
      ? 'En uso / total'
      : `${ramPercent}% en uso · ${formatGiB(ramTotal)} GB total`;
  const updateTime = snapshot
    ? new Date(snapshot.capturedAtUtc).toLocaleTimeString()
    : null;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1016" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>PANEL DE CONTROL</Text>
            <Text style={styles.title}>Panel PC</Text>
            <Text style={styles.subtitle}>Tu equipo, de un vistazo.</Text>
          </View>

          <View style={styles.connectionPill}>
            <View
              style={[
                styles.connectionDot,
                isConnected ? styles.connectionDotActive : null,
                connectionState === 'connecting'
                  ? styles.connectionDotWaiting
                  : null,
              ]}
            />
            <Text style={styles.connectionText}>
              {connectionLabel(connectionState)}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECURSOS</Text>
          <Text style={styles.liveLabel}>
            {isConnected ? 'EN VIVO' : connectionState === 'paused' ? 'PAUSADO' : 'EN ESPERA'}
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard
            label="PROCESADOR"
            value={formatPercent(snapshot?.cpuUsagePercent)}
            unit="%"
            detail={cpuDetail}
            accent="#58D6AE"
          />
          <MetricCard
            label="GRÁFICA NVIDIA"
            value={formatPercent(snapshot?.gpuUsagePercent)}
            unit="%"
            detail={gpuDetail}
            accent="#8DA8FF"
          />
          <MetricCard
            label="TEMPERATURA GPU"
            value={
              snapshot?.gpuTemperatureCelsius == null
                ? '—'
                : `${Math.round(snapshot.gpuTemperatureCelsius)}`
            }
            unit="°C"
            detail={temperatureDetail}
            accent="#FFB36B"
          />
          <MetricCard
            label="MEMORIA RAM"
            value={formatGiB(ramUsed)}
            unit="GB"
            detail={ramDetail}
            accent="#D69BFF"
          />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            {isConnected
              ? 'Lecturas de la PC recibidas'
              : connectionState === 'paused'
                ? 'Panel en pausa'
                : 'Esperando a la PC'}
          </Text>
          <Text style={styles.noticeText}>
            {isConnected && updateTime
              ? `Última lectura: ${updateTime}. Si un sensor no está disponible, se muestra como guion.`
              : connectionState === 'paused'
                ? 'La aplicación deja de consultar mientras está en segundo plano.'
                : 'Conecta el celular por USB y habilita adb reverse en Windows. Las lecturas antiguas se limpian al perder conexión.'}
          </Text>
        </View>

        <Text style={styles.footer}>USB · SOLO LECTURA · SIN DATOS SIMULADOS</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B1016',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 36,
  },
  eyebrow: {
    color: '#58D6AE',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 9,
  },
  title: {
    color: '#F4F7FA',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8793A0',
    fontSize: 14,
    marginTop: 6,
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171E26',
    borderColor: '#29333E',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginTop: 5,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#7C8792',
    marginRight: 7,
  },
  connectionDotActive: {
    backgroundColor: '#58D6AE',
  },
  connectionDotWaiting: {
    backgroundColor: '#FFB36B',
  },
  connectionText: {
    color: '#A8B2BC',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#9BA7B2',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.7,
  },
  liveLabel: {
    color: '#66727E',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  metricCard: {
    width: '48%',
    minHeight: 132,
    overflow: 'hidden',
    backgroundColor: '#121922',
    borderColor: '#202B36',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  metricAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  metricLabel: {
    color: '#83909D',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 3,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 13,
  },
  metricValue: {
    color: '#F4F7FA',
    fontSize: 34,
    fontWeight: '700',
  },
  metricUnit: {
    color: '#AAB4BE',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 5,
  },
  metricDetail: {
    color: '#73808D',
    fontSize: 11,
    marginTop: 3,
  },
  notice: {
    backgroundColor: '#111A21',
    borderColor: '#26343D',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 22,
  },
  noticeTitle: {
    color: '#DEE6EC',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  noticeText: {
    color: '#8996A2',
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    color: '#596570',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginTop: 26,
  },
});

export default App;
