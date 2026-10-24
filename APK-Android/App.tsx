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
      <View style={[styles.metricAccent, { backgroundColor: accent }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function App() {
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
            <View style={styles.connectionDot} />
            <Text style={styles.connectionText}>SIN CONEXIÓN</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECURSOS</Text>
          <Text style={styles.liveLabel}>EN ESPERA</Text>
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard
            label="PROCESADOR"
            value="—"
            unit="%"
            detail="Uso de CPU"
            accent="#58D6AE"
          />
          <MetricCard
            label="GRÁFICA NVIDIA"
            value="—"
            unit="%"
            detail="Uso de GPU"
            accent="#8DA8FF"
          />
          <MetricCard
            label="TEMPERATURA GPU"
            value="—"
            unit="°C"
            detail="Sensor no conectado"
            accent="#FFB36B"
          />
          <MetricCard
            label="MEMORIA RAM"
            value="—"
            unit="GB"
            detail="En uso / total"
            accent="#D69BFF"
          />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Esperando a la PC</Text>
          <Text style={styles.noticeText}>
            Los guiones indican que todavía no hay lecturas. La conexión USB y
            la lectura de sensores se integrarán después de validar el método
            de comunicación.
          </Text>
        </View>

        <Text style={styles.footer}>MODO LOCAL · SIN DATOS SIMULADOS</Text>
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
