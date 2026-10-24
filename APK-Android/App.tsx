import {useEffect, useRef, useState} from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {useTelemetry} from './src/hooks/useTelemetry';
import type {ConnectionState, DiskTelemetry, TelemetryReading, TelemetrySnapshot} from './src/types/telemetry';

const colors = {
  background: '#090E14',
  panel: '#101821',
  panelRaised: '#141E28',
  border: '#26323E',
  muted: '#7F8C99',
  text: '#F2F6FA',
  green: '#54E0B5',
  blue: '#7295FF',
  amber: '#FFB66D',
  purple: '#D59CFF',
  red: '#FF6E78',
};

function formatPercent(value: number | null | undefined) {
  return value == null ? '—' : `${Math.round(value)}`;
}

function formatTemperature(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) || value <= 0 ? '—°C' : `${Math.round(value)}°C`;
}

function formatBytes(value: number | null | undefined) {
  return value == null ? '—' : `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function formatRate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1024) return `${value.toFixed(0)} B/s`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${(value / 1024 ** 2).toFixed(1)} MB/s`;
}

function formatClock(value: number | null | undefined) {
  return value == null || value <= 0 ? '—' : `${Math.round(value)} MHz`;
}

function formatDuration(value: number | null | undefined) {
  if (value == null || value < 0) return '—';
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return days > 0 ? `${days} d ${hours} h` : hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function friendlySensorName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('pch') || normalized.includes('chipset')) return `Chipset · ${name}`;
  if (normalized.includes('vrm') || normalized.includes('mos')) return `Reguladores VRM · ${name}`;
  if (normalized.includes('system') || normalized.includes('motherboard') || normalized.includes('board')) return `Placa / sistema · ${name}`;
  if (normalized.includes('cputin') || normalized.includes('cpu')) return `CPU · ${name}`;
  if (normalized.includes('aux') || normalized.includes('tmpin')) return `Sensor auxiliar · ${name}`;
  return name;
}

function cpuReadingPriority(reading: TelemetryReading) {
  const name = reading.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (name.includes('coremax') || name.includes('maxcore')) return 0;
  if (name.includes('tctl') || name.includes('tdie') || name.includes('package')) return 1;
  if (name.includes('ccd')) return 2;
  return 3;
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

function Gauge({
  label,
  value,
  temperature,
  detail,
  color,
  size,
}: {
  label: string;
  value: number | null | undefined;
  temperature: number | null | undefined;
  detail: string;
  color: string;
  size: number;
}) {
  const count = 48;
  const center = size / 2;
  const tickWidth = Math.max(2, size * 0.014);
  const tickHeight = Math.max(7, size * 0.045);
  const radius = size / 2 - tickHeight / 2 - 2;
  const normalized = value == null ? 0 : Math.max(0, Math.min(100, value));
  const activeColor = normalized >= 90 ? colors.red : normalized >= 75 ? colors.amber : color;

  return (
    <View style={[styles.gaugeWrap, {width: size + 24}]}>
      <Text style={styles.gaugeLabel}>{label}</Text>
      <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
        {Array.from({length: count}, (_, index) => {
          const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
          const x = center + Math.cos(angle) * radius - tickWidth / 2;
          const y = center + Math.sin(angle) * radius - tickHeight / 2;
          const active = value != null && index < Math.round((normalized / 100) * count);
          return (
            <View
              key={index}
              style={[
                styles.gaugeTick,
                {
                  left: x,
                  top: y,
                  width: tickWidth,
                  height: tickHeight,
                  backgroundColor: active ? activeColor : '#26313C',
                  transform: [{rotate: `${(angle * 180) / Math.PI + 90}deg`}],
                },
              ]}
            />
          );
        })}
        <View
          style={[
            styles.gaugeCenter,
            {
              width: size * 0.69,
              height: size * 0.69,
              borderColor: `${color}35`,
            },
          ]}>
          <Text style={[styles.gaugeValue, {fontSize: size * 0.28}]}>
            {formatPercent(value)}
            <Text style={styles.gaugePercent}>%</Text>
          </Text>
          <Text style={styles.gaugeCaption}>USO</Text>
        </View>
      </View>
      <View style={styles.gaugeFooter}>
        <Text style={[styles.gaugeTemperature, {color}]}>{formatTemperature(temperature)}</Text>
        <Text style={styles.gaugeDetail} numberOfLines={1}>{detail}</Text>
      </View>
    </View>
  );
}

function DetailCard({
  label,
  value,
  note,
  accent = colors.green,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: string;
}) {
  return (
    <View style={styles.detailCard}>
      <View style={[styles.detailAccent, {backgroundColor: accent}]} />
      <Text style={styles.detailLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
        {value}
      </Text>
      {note ? <Text style={styles.detailNote} numberOfLines={1}>{note}</Text> : null}
    </View>
  );
}

function MemoryPanel({snapshot}: {snapshot: TelemetrySnapshot | null}) {
  const memories = [
    {label: 'MEMORIA RAM', used: snapshot?.ramUsedBytes, total: snapshot?.ramTotalBytes, temperature: snapshot?.ramTemperatureCelsius, color: colors.purple},
    {label: 'VRAM · GPU', used: snapshot?.gpuMemoryUsedBytes, total: snapshot?.gpuMemoryTotalBytes, temperature: null, color: colors.blue},
  ];
  return (
    <View style={styles.memoryPanel}>
      {memories.map((memory, index) => {
        const percent = memory.used != null && memory.total != null && memory.total > 0
          ? Math.min(100, (memory.used / memory.total) * 100) : null;
        return (
          <View key={memory.label} style={[styles.memoryHalf, index === 1 && styles.memoryHalfRight]}>
            <View style={styles.memoryHeading}>
              <Text style={styles.ramLabel}>{memory.label}</Text>
              <Text style={styles.memoryPercent}>{percent == null ? '—' : `${Math.round(percent)}%`}</Text>
            </View>
            <View style={styles.ramTrack}>
              <View style={[styles.ramFill, {width: `${percent ?? 0}%`, backgroundColor: (percent ?? 0) >= 90 ? colors.red : memory.color}]} />
            </View>
            <Text style={styles.memoryAmounts} numberOfLines={1} adjustsFontSizeToFit>
              {formatBytes(memory.used)} <Text style={styles.ramTotal}>/ {formatBytes(memory.total)}</Text>
              {memory.temperature != null && memory.temperature > 0 ? <Text style={styles.ramTemp}>  ·  {formatTemperature(memory.temperature)}</Text> : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ReadingRow({reading, accent = colors.green}: {reading: TelemetryReading; accent?: string}) {
  return (
    <View style={styles.readingRow}>
      <View style={[styles.readingDot, {backgroundColor: accent}]} />
      <View style={styles.readingCopy}>
        <Text style={styles.readingName} numberOfLines={1}>{friendlySensorName(reading.name)}</Text>
        <Text style={styles.readingHardware} numberOfLines={1}>
          {reading.hardware}{reading.maxValue != null ? ` · pico registrado ${Math.round(reading.maxValue)} ${reading.unit}` : ''}
        </Text>
      </View>
      <Text style={styles.readingValue} numberOfLines={1} adjustsFontSizeToFit>
        {Math.round(reading.value)} {reading.unit}
      </Text>
    </View>
  );
}

function ReadingPanel({
  title,
  readings,
  emptyMessage,
  note,
  accent = colors.green,
}: {
  title: string;
  readings: TelemetryReading[];
  emptyMessage: string;
  note?: string;
  accent?: string;
}) {
  return (
    <View style={styles.readingPanel}>
      <Text style={styles.readingPanelTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Text>
      {readings.length > 0 ? (
        <ScrollView style={styles.readingList} nestedScrollEnabled showsVerticalScrollIndicator>
          {readings.map((reading, index) => (
            <ReadingRow key={`${reading.hardware}-${reading.name}-${index}`} reading={reading} accent={accent} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.readingEmpty}><Text style={styles.readingEmptyText}>{emptyMessage}</Text></View>
      )}
      {note ? <Text style={styles.panelFootnote}>{note}</Text> : null}
    </View>
  );
}

function DiskCard({disk}: {disk: DiskTelemetry}) {
  const capacityPercent = disk.capacityBytes != null && disk.capacityBytes > 0 && disk.usedBytes != null
    ? Math.max(0, Math.min(100, (disk.usedBytes / disk.capacityBytes) * 100))
    : null;
  const healthColor = /saludable|healthy|ok/i.test(disk.healthStatus) ? colors.green :
    /advertencia|warning|unhealthy|no saludable/i.test(disk.healthStatus) ? colors.amber : colors.muted;
  const temperatureColor = disk.temperatureCelsius == null ? colors.muted :
    disk.temperatureCelsius >= 60 ? colors.red : disk.temperatureCelsius >= 50 ? colors.amber : colors.green;
  const activeTime = disk.activeTimePercent == null ? null : Math.max(0, Math.min(100, disk.activeTimePercent));

  return (
    <View style={styles.diskCard}>
      <View style={styles.diskCardHeader}>
        <Text style={styles.diskNumber}>DISCO FÍSICO {disk.number}</Text>
        <Text style={[styles.diskHealth, {color: healthColor}]}>{disk.healthStatus.toUpperCase()}</Text>
      </View>
      <Text style={styles.diskModel} numberOfLines={2}>{disk.model}</Text>
      <Text style={styles.diskMeta}>{disk.busType} · {disk.mediaType}</Text>

      <View style={styles.diskHeroRow}>
        <View>
          <Text style={styles.diskSectionLabel}>TEMPERATURA DEL DISCO</Text>
          <Text style={[styles.diskTemperature, {color: temperatureColor}]}>
            {disk.temperatureCelsius == null ? '—' : disk.temperatureCelsius.toFixed(0)}<Text style={styles.diskTemperatureUnit}>°C</Text>
          </Text>
        </View>
        <View style={styles.diskLifeBadge}>
          <Text style={styles.diskSectionLabel}>VIDA</Text>
          <Text style={styles.diskLifeValue}>{disk.lifePercent == null ? '—' : `${Math.round(disk.lifePercent)}%`}</Text>
        </View>
      </View>

      <View style={styles.diskActivityHeader}>
        <Text style={styles.diskSectionLabel}>TIEMPO ACTIVO</Text>
        <Text style={styles.diskActivityPercent}>{activeTime == null ? '—' : `${Math.round(activeTime)}%`}</Text>
      </View>
      <View style={styles.diskActivityTrack}>
        <View style={[styles.diskActivityFill, {width: `${activeTime ?? 0}%`, backgroundColor: (activeTime ?? 0) >= 90 ? colors.amber : colors.blue}]} />
      </View>

      <View style={styles.diskCapacityHeader}>
        <Text style={styles.diskSectionLabel}>CAPACIDAD USADA</Text>
        <Text style={styles.diskPercent}>{capacityPercent == null ? '—' : `${Math.round(capacityPercent)}%`}</Text>
      </View>
      <View style={styles.ramTrack}>
        <View style={[styles.ramFill, {width: `${capacityPercent ?? 0}%`, backgroundColor: (capacityPercent ?? 0) >= 90 ? colors.red : colors.blue}]} />
      </View>
      <Text style={styles.diskCapacityText} numberOfLines={1} adjustsFontSizeToFit>
        {formatBytes(disk.usedBytes)} usado / {formatBytes(disk.capacityBytes)} total
      </Text>

      <View style={styles.diskRateRow}>
        <View style={styles.diskRateCell}>
          <Text style={styles.diskSectionLabel}>LECTURA</Text>
          <Text style={styles.diskRateValue}>{formatRate(disk.readBytesPerSecond)}</Text>
        </View>
        <View style={styles.diskRateCell}>
          <Text style={styles.diskSectionLabel}>ESCRITURA</Text>
          <Text style={styles.diskRateValue}>{formatRate(disk.writeBytesPerSecond)}</Text>
        </View>
      </View>
      <Text style={styles.diskVolumes} numberOfLines={2}>
        {disk.volumes.length > 0
          ? disk.volumes.map(volume => `${volume.deviceId} ${volume.label ?? ''} · ${formatBytes(volume.usedBytes)}/${formatBytes(volume.totalBytes)} (${formatBytes(volume.availableBytes)} libres)`).join('   ·   ')
          : 'Sin volúmenes listos con letra de unidad'}
      </Text>
    </View>
  );
}

function SummaryCard({label, value, note, accent = colors.green, size = 'normal'}: {label: string; value: string; note?: string; accent?: string; size?: 'normal' | 'info'}) {
  return (
    <View style={size === 'info' ? styles.infoCard : styles.summaryCard}>
      <View style={[styles.detailAccent, {backgroundColor: accent}]} />
      <Text style={styles.detailLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      {note ? <Text style={styles.detailNote} numberOfLines={1}>{note}</Text> : null}
    </View>
  );
}

function PageHeader({eyebrow, title, connectionState, snapshot}: {
  eyebrow: string;
  title: string;
  connectionState: ConnectionState;
  snapshot: TelemetrySnapshot | null;
}) {
  const connected = connectionState === 'connected';
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.detailTitle}>{title}</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.liveText}>{connected ? '●  ACTUALIZANDO' : '○  SIN DATOS'}</Text>
        <Text style={styles.lastUpdate}>
          {snapshot ? new Date(snapshot.capturedAtUtc).toLocaleTimeString() : connectionLabel(connectionState)}
        </Text>
      </View>
    </View>
  );
}

function PageFooter({activePage, pageCount, hint}: {activePage: number; pageCount: number; hint: string}) {
  return (
    <View style={styles.detailFooter}>
      <Text style={styles.swipeHint}>DESLIZA {hint}</Text>
      <View style={styles.footerCenter}>
        <PageDots activePage={activePage} pageCount={pageCount} />
        <Text style={styles.pageNumber}>{activePage + 1}/{pageCount}</Text>
      </View>
      <Text style={styles.swipeHint}>{activePage === pageCount - 1 ? 'DESLIZA PARA VOLVER' : 'SIGUIENTE'}</Text>
    </View>
  );
}

function App() {
  const {connectionState, snapshot} = useTelemetry();
  const {width, height} = useWindowDimensions();
  const [activePage, setActivePage] = useState(0);
  const scrollRef = useRef<any>(null);
  const pageCount = 5;
  const isConnected = connectionState === 'connected';
  const dialSize = Math.min(height * 0.49, width * 0.27, 228);
  useEffect(() => {
    setActivePage(0);
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({x: 0, y: 0, animated: false}));
    return () => cancelAnimationFrame(frame);
  }, [width]);

  const onPageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    if (page !== activePage) {
      setActivePage(page);
    }
  };

  const computerInfo = [
    {label: 'NOMBRE DEL PC', value: snapshot?.computerName ?? '—', note: 'Nombre del equipo', accent: colors.green},
    {label: 'SISTEMA OPERATIVO', value: snapshot?.osName ?? '—', note: snapshot?.osArchitecture ?? '—', accent: colors.blue},
    {label: 'TIEMPO ENCENDIDO', value: formatDuration(snapshot?.systemUptimeSeconds), note: snapshot?.dotNetVersion ? `.NET ${snapshot.dotNetVersion}` : 'Agente de Windows', accent: colors.amber},
    {label: 'PROCESADOR', value: snapshot?.cpuName ?? 'No detectado', note: `${snapshot?.cpuLogicalProcessorCount ?? '—'} hilos lógicos`, accent: colors.green},
    {label: 'PLACA BASE', value: snapshot?.motherboardName ?? 'No detectada', note: 'Modelo informado por el sensor', accent: colors.purple},
    {label: 'TARJETA GRÁFICA', value: snapshot?.gpuName ?? 'No detectada', note: `${formatPercent(snapshot?.gpuUsagePercent)}% uso · ${formatTemperature(snapshot?.gpuTemperatureCelsius)}`, accent: colors.blue},
    {label: 'MEMORIA RAM', value: formatBytes(snapshot?.ramTotalBytes), note: `${formatBytes(snapshot?.ramUsedBytes)} en uso`, accent: colors.purple},
    {label: 'MEMORIA DE VIDEO', value: formatBytes(snapshot?.gpuMemoryTotalBytes), note: `${formatBytes(snapshot?.gpuMemoryUsedBytes)} en uso`, accent: colors.blue},
    {label: 'LECTURA DE SENSORES', value: snapshot?.agentIsElevated ? 'ADMINISTRADOR' : 'NORMAL', note: snapshot?.agentIsElevated ? 'Sensores avanzados habilitados' : 'Para CPU y ventiladores, iniciar como administrador', accent: snapshot?.agentIsElevated ? colors.green : colors.amber},
  ];

  const fans = snapshot?.fanReadings ?? [];
  const gpuFans = fans.filter(reading => /nvidia|gpu|video/i.test(`${reading.hardware} ${reading.name}`));
  // The Nuvoton controller on this ASRock board exposes generic Fan #N names.
  // Fan #2 is the likely CPU_FAN tach reading observed on this machine.
  const likelyCpuFan = (reading: TelemetryReading) =>
    /cpu|processor/i.test(`${reading.hardware} ${reading.name}`) ||
    (/nct6796d-r/i.test(reading.hardware) && /^fan #2$/i.test(reading.name) && /b550m phantom gaming 4/i.test(snapshot?.motherboardName ?? ''));
  const cpuFans = fans.filter(likelyCpuFan);
  const otherFans = fans.filter(reading => !gpuFans.includes(reading) && !cpuFans.includes(reading));
  const boardTemps = snapshot?.motherboardTemperatureSensors ?? [];
  const cpuCoreReadings = [...(snapshot?.cpuCoreReadings ?? [])]
    .sort((left, right) => cpuReadingPriority(left) - cpuReadingPriority(right));

  return (
    <View style={styles.screen}>
      <StatusBar hidden barStyle="light-content" />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPageScroll}
        scrollEventThrottle={16}>
        <View style={[styles.page, {width, height}]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>PANEL DE HARDWARE</Text>
              <Text style={styles.title}>Panel PC</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.liveText}>{isConnected ? '●  EN VIVO' : '○  ESPERANDO'}</Text>
              <View style={styles.connectionPill}>
                <View style={[styles.connectionDot, isConnected ? styles.connectionDotActive : null]} />
                <Text style={styles.connectionText}>{connectionLabel(connectionState)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.gaugeRow}>
            <Gauge
              label="CPU"
              value={snapshot?.cpuUsagePercent}
              temperature={snapshot?.cpuTemperatureCelsius}
              detail={snapshot?.cpuName ?? 'PROCESADOR'}
              color={colors.green}
              size={dialSize}
            />
            <View style={styles.gaugeDivider} />
            <Gauge
              label="GPU"
              value={snapshot?.gpuUsagePercent}
              temperature={snapshot?.gpuTemperatureCelsius}
              detail={snapshot?.gpuName ?? 'TARJETA GRÁFICA'}
              color={colors.blue}
              size={dialSize}
            />
          </View>

          <MemoryPanel snapshot={snapshot} />
          <View style={styles.pageFooter}>
            <Text style={styles.swipeHint}>DESLIZA PARA VER DETALLES</Text>
            <PageDots activePage={activePage} pageCount={pageCount} />
            <Text style={styles.pageNumber}>1/{pageCount}</Text>
          </View>
        </View>

        <View style={[styles.page, {width, height}]}>
          <PageHeader eyebrow="PLACA BASE · PROCESADOR" title="Placa y núcleos" connectionState={connectionState} snapshot={snapshot} />
          <View style={styles.pageBodyColumns}>
            <ReadingPanel title={`TEMPERATURAS DE PLACA · ${snapshot?.motherboardName ?? 'SIN DATOS'}`} readings={boardTemps} emptyMessage="La placa no publica sensores de temperatura al agente." note="TMPIN/AUX son sensores auxiliares; su ubicación exacta depende del fabricante." accent={colors.purple} />
            <ReadingPanel title="NÚCLEOS DEL PROCESADOR" readings={cpuCoreReadings} emptyMessage="El procesador no publica carga o temperatura individual por núcleo." note="Core Max, Tctl/Tdie y CCD1 aparecen primero; se muestra el pico de temperatura registrado." accent={colors.green} />
          </View>
          <PageFooter activePage={activePage} pageCount={pageCount} hint="PARA VENTILADORES Y FRECUENCIAS" />
        </View>

        <View style={[styles.page, {width, height}]}>
          <PageHeader eyebrow="VENTILADORES DISPONIBLES" title="Ventiladores" connectionState={connectionState} snapshot={snapshot} />
          <View style={styles.pageBodyColumns}>
            <View style={styles.fanLeftColumn}>
              <ReadingPanel title="VENTILADOR DE GPU" readings={gpuFans} emptyMessage="La GPU no publica la velocidad de sus ventiladores." note="NVIDIA suele informar porcentaje en lugar de RPM." accent={colors.blue} />
              <ReadingPanel title="VENTILADOR DE CPU" readings={cpuFans} emptyMessage="No hay una lectura identificada como ventilador de CPU." note="En esta placa el controlador la publica como Fan #2; probablemente corresponde al cooler de CPU." accent={colors.green} />
            </View>
            <ReadingPanel title="DEMÁS VENTILADORES · PLACA / CAJA" readings={otherFans} emptyMessage="La placa/controlador no publica otras lecturas." note="Un valor 0 puede ser fan-stop o falta de tacómetro; el pico registrado no es la RPM nominal." accent={colors.purple} />
          </View>
          <PageFooter activePage={activePage} pageCount={pageCount} hint="PARA VER LOS DISCOS" />
        </View>

        <View style={[styles.page, {width, height}]}>
          <PageHeader eyebrow="ALMACENAMIENTO Y ACTIVIDAD" title="Discos" connectionState={connectionState} snapshot={snapshot} />
          {snapshot?.disks.length ? (
            <ScrollView style={styles.diskScroll} contentContainerStyle={styles.diskGrid} nestedScrollEnabled showsVerticalScrollIndicator>
              {snapshot.disks.map(disk => <DiskCard key={disk.number} disk={disk} />)}
            </ScrollView>
          ) : (
            <View style={styles.diskEmpty}>
              <Text style={styles.readingEmptyText}>{snapshot ? 'Windows no publica discos físicos al agente.' : 'Esperando lecturas del agente de Windows.'}</Text>
            </View>
          )}
          <PageFooter activePage={activePage} pageCount={pageCount} hint="PARA INFORMACIÓN DEL PC" />
        </View>

        <View style={[styles.page, {width, height}]}>
          <PageHeader eyebrow="IDENTIFICACIÓN Y ESTADO" title="Información del PC" connectionState={connectionState} snapshot={snapshot} />
          <View style={styles.infoGrid}>
            {computerInfo.map(card => <SummaryCard key={card.label} size="info" {...card} />)}
          </View>
          <PageFooter activePage={activePage} pageCount={pageCount} hint="PARA VOLVER AL PANEL" />
        </View>
      </ScrollView>
    </View>
  );
}

function PageDots({activePage, pageCount}: {activePage: number; pageCount: number}) {
  return (
    <View style={styles.pageDots}>
      {Array.from({length: pageCount}, (_, page) => (
        <View key={page} style={[styles.pageDot, activePage === page ? styles.pageDotActive : null]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  page: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  header: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {color: colors.green, fontSize: 10, fontWeight: '800', letterSpacing: 2},
  title: {color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 2},
  detailTitle: {color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2},
  headerRight: {alignItems: 'flex-end', gap: 6},
  liveText: {color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.2},
  lastUpdate: {color: colors.muted, fontSize: 10},
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151E27',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  connectionDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#687480', marginRight: 7},
  connectionDotActive: {backgroundColor: colors.green},
  connectionText: {color: '#BEC8D1', fontSize: 9, fontWeight: '800', letterSpacing: 0.7},
  gaugeRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginTop: -2,
  },
  gaugeWrap: {alignItems: 'center', justifyContent: 'center'},
  gaugeLabel: {color: '#A9B5C1', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 1},
  gaugeTick: {position: 'absolute', borderRadius: 2},
  gaugeCenter: {
    backgroundColor: '#0C131B',
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeValue: {color: colors.text, fontWeight: '800', includeFontPadding: false},
  gaugePercent: {color: '#99A6B2', fontSize: 14, fontWeight: '700'},
  gaugeCaption: {color: '#64717F', fontSize: 8, fontWeight: '800', letterSpacing: 2, marginTop: 1},
  gaugeFooter: {alignItems: 'center', maxWidth: '100%', marginTop: 3},
  gaugeTemperature: {fontSize: 18, fontWeight: '800'},
  gaugeDetail: {color: colors.muted, fontSize: 9, marginTop: 1, maxWidth: 220},
  gaugeDivider: {height: '55%', width: 1, backgroundColor: '#1D2934'},
  memoryPanel: {
    minHeight: 58,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  memoryHalf: {flex: 1, justifyContent: 'center', paddingHorizontal: 10},
  memoryHalfRight: {borderLeftWidth: 1, borderLeftColor: colors.border},
  memoryHeading: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7},
  memoryPercent: {color: colors.text, fontSize: 12, fontWeight: '800'},
  ramLabel: {color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.6},
  memoryAmounts: {color: colors.text, fontSize: 10, fontWeight: '800', marginTop: 5},
  ramTotal: {color: '#8C98A4', fontSize: 10, fontWeight: '600'},
  ramTrack: {height: 7, borderRadius: 8, overflow: 'hidden', backgroundColor: '#27323E'},
  ramFill: {height: '100%', borderRadius: 8},
  ramTemp: {color: colors.muted, fontWeight: '600', letterSpacing: 0},
  pageFooter: {height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  detailFooter: {height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  footerCenter: {flexDirection: 'row', alignItems: 'center'},
  pageNumber: {color: '#687582', fontSize: 8, fontWeight: '800', letterSpacing: 1},
  swipeHint: {color: '#687582', fontSize: 8, fontWeight: '800', letterSpacing: 1.3},
  pageDots: {flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: 10},
  pageDot: {height: 5, width: 5, borderRadius: 4, backgroundColor: '#37424D'},
  pageDotActive: {width: 16, backgroundColor: colors.green},
  pageBodyColumns: {flex: 1, minHeight: 0, flexDirection: 'row', gap: 12, marginVertical: 8},
  fanLeftColumn: {flex: 1, minWidth: 0, minHeight: 0, gap: 10},
  diskScroll: {flex: 1, minHeight: 0, marginVertical: 8},
  diskGrid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'flex-start', gap: 10, paddingBottom: 8},
  diskCard: {width: '49%', minHeight: 215, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, overflow: 'hidden'},
  diskCardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  diskNumber: {color: colors.blue, fontSize: 8, fontWeight: '800', letterSpacing: 1.2},
  diskHealth: {fontSize: 8, fontWeight: '800', letterSpacing: 0.6},
  diskModel: {color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4},
  diskMeta: {color: colors.muted, fontSize: 9, marginTop: 3},
  diskHeroRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10},
  diskTemperature: {fontSize: 27, lineHeight: 31, fontWeight: '900', marginTop: 2},
  diskTemperatureUnit: {fontSize: 14, fontWeight: '800'},
  diskLifeBadge: {minWidth: 55, alignItems: 'flex-end'},
  diskLifeValue: {color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 3},
  diskActivityHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7, marginBottom: 4},
  diskActivityPercent: {color: colors.text, fontSize: 12, fontWeight: '900'},
  diskActivityTrack: {height: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: '#27323E'},
  diskActivityFill: {height: '100%', borderRadius: 8},
  diskCapacityHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9, marginBottom: 5},
  diskSectionLabel: {color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1},
  diskPercent: {color: colors.text, fontSize: 10, fontWeight: '800'},
  diskCapacityText: {color: colors.text, fontSize: 9, fontWeight: '700', marginTop: 5},
  diskRateRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 8},
  diskRateCell: {width: '48%'},
  diskRateValue: {color: colors.text, fontSize: 11, fontWeight: '800', marginTop: 3},
  diskVolumes: {color: '#9AA6B2', fontSize: 8, lineHeight: 12, marginTop: 6},
  diskEmpty: {flex: 1, alignItems: 'center', justifyContent: 'center', marginVertical: 8, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingHorizontal: 24},
  readingPanel: {flex: 1, minWidth: 0, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 11, overflow: 'hidden'},
  readingPanelTitle: {color: '#AEBAC5', fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 8},
  readingList: {flex: 1},
  readingRow: {minHeight: 43, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#202B36', paddingVertical: 5, gap: 8},
  readingDot: {width: 7, height: 7, borderRadius: 4},
  readingCopy: {flex: 1, minWidth: 0},
  readingName: {color: colors.text, fontSize: 11, fontWeight: '700'},
  readingHardware: {color: colors.muted, fontSize: 8, marginTop: 2},
  readingValue: {color: colors.text, fontSize: 12, fontWeight: '800', minWidth: 74, textAlign: 'right'},
  readingEmpty: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20},
  readingEmptyText: {color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16},
  panelFootnote: {color: colors.muted, fontSize: 8, marginTop: 7},
  summaryCard: {width: '48%', height: '31%', minHeight: 65, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, overflow: 'hidden', justifyContent: 'center'},
  summaryValue: {color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3},
  infoGrid: {flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'center', gap: 10, marginVertical: 8},
  infoCard: {width: '32%', height: '30%', minHeight: 65, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, overflow: 'hidden', justifyContent: 'center'},
  detailGrid: {flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'space-between', rowGap: 9},
  detailCard: {
    width: '24%',
    height: '44%',
    minHeight: 72,
    maxHeight: 96,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  detailAccent: {position: 'absolute', top: 0, left: 0, right: 0, height: 2},
  detailLabel: {color: '#8794A1', fontSize: 8, fontWeight: '800', letterSpacing: 1, marginBottom: 4},
  detailValue: {color: colors.text, fontSize: 16, fontWeight: '800'},
  detailNote: {color: colors.muted, fontSize: 9, marginTop: 3},
});

export default App;
