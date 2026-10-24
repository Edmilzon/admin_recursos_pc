# Admin Recursos PC

Panel Android para reutilizar un celular como tablero táctil de los recursos de una PC Windows. El MVP es de solo lectura: muestra uso de CPU, uso y temperatura de GPU NVIDIA consultable por NVML, RAM y VRAM usadas/totales, y sensores adicionales cuando el equipo los expone.

> **Estado:** compilado y probado en el TECNO CE9 por USB (Debug ARM64). El agente consulta CPU/RAM, sensores expuestos por LibreHardwareMonitor y datos de GPU NVIDIA mediante NVML. Véase el registro de continuidad al final para el resultado y los límites medidos.

## Qué hace

- El agente de Windows consulta CPU y RAM mediante APIs de Windows. Solo calcula lecturas mientras hay una conexión WebSocket del panel.
- Para la primera GPU NVIDIA, el agente intenta cargar NVML (`nvml.dll`) desde el controlador instalado. Uso y temperatura se envían como `null` cuando la biblioteca, el controlador o el sensor no los exponen.
- El agente abre un servidor WebSocket en `127.0.0.1:8765`, acepta un panel y envía un objeto JSON cada segundo. No escucha en la red local.
- La APK se usa en horizontal y tiene cinco páginas: panel CPU/GPU + RAM/VRAM; placa y núcleos; ventiladores; discos; información general del PC. No genera datos de ejemplo; descarta las lecturas al desconectarse.
- La APK reintenta la conexión cada dos segundos y cierra el WebSocket cuando pasa a segundo plano. Al volver al frente se conecta nuevamente.
- Para pasar el tráfico por el cable se usa `adb reverse`. Esto es una ruta de desarrollo USB que requiere depuración USB autorizada en el teléfono; todavía debe validarse con los modelos reales.

El proceso de Windows queda escuchando en localhost, pero sin una APK conectada no ejecuta el ciclo de lectura de sensores. Con un cliente conectado hace una muestra por segundo. La huella real debe medirse en esa PC antes de afirmar que es imperceptible.

## Cómo fluye la información

```text
APIs de Windows ── CPU y RAM ─┐
Controlador NVIDIA ── NVML ────┴─> Agente C#/.NET
                                      │ WebSocket localhost:8765
                                      │ adb reverse por USB
                                      v
                              APK React Native
                              tablero y conexión
```

En el teléfono, la app se conecta a `ws://localhost:8765/ws`. El puente ADB redirige el puerto 8765 del teléfono al mismo puerto de Windows. La API de estado local es `http://127.0.0.1:8765/health`.

## Funciones del MVP

| Función | Implementación | Límite actual |
|---|---|---|
| CPU y sensores de hardware | `GetSystemTimes` y `LibreHardwareMonitorLib`; CPU, temperatura/reloj si el sensor los expone. | Algunos sensores necesitan permisos de administrador o no están disponibles en todos los equipos. Temperaturas/relojes nulos, cero o inválidos se muestran como no disponibles. |
| RAM | `GlobalMemoryStatusEx`; muestra GiB usados, total y porcentaje. | No se lee memoria virtual ni se guarda historial. |
| GPU y VRAM | NVIDIA NVML cargada dinámicamente; uso, temperatura, memoria, reloj y ventilador según soporte. | Puede no estar expuesta por algunos modelos/controladores o configuraciones; el dato ausente es `null`. |
| Enlace | WebSocket de ASP.NET Core en loopback; una conexión a la vez. | El transporte USB usa ADB reverse y requiere depuración USB. No es una conexión USB directa para el usuario final. |
| Reconexión | La app reintenta cada 2 s y elimina datos viejos al cerrar el socket. | `adb reverse` debe volver a configurarse si se pierde o reinicia el puente. |
| Pausa en segundo plano | `AppState` cierra el socket al salir del primer plano. | El agente sigue escuchando localmente, pero deja de sondear sensores. |

Quedan fuera de este MVP: potencia, FPS, discos/red, historial, nube, control de hardware, servicio de Windows, instalación automática y múltiples GPU.

## Estructura del repositorio

```text
Desarrollo/
├── README.md
├── APK-Android/
│   ├── App.tsx                         # Tablero táctil
│   ├── src/hooks/useTelemetry.ts       # WebSocket, reconexión y pausa
│   ├── src/types/telemetry.ts          # Contrato JSON y validación
│   └── android/app/src/main/res/xml/
│       └── network_security_config.xml # HTTP permitido solo a localhost
└── Ejecutable-Windows/
    ├── Program.cs                      # Kestrel, /health y /ws
    ├── Models/TelemetrySnapshot.cs     # Mensaje enviado al celular
    └── Services/
        ├── SystemTelemetryReader.cs    # CPU/RAM, SO, uptime y agregación de lecturas
        ├── HardwareSensorReader.cs     # Sensores LHM de CPU, placa, fans y clocks
        └── NvidiaGpuReader.cs          # Adaptador opcional de NVML
```

## Herramientas y bibliotecas

### APK Android

- React Native `0.88.0`, React `19.3.0` y TypeScript (`package.json` es la referencia exacta).
- Node.js `22.11.0` o superior y npm.
- JDK `17`.
- Android SDK Platform `37`, Build Tools `37.0.0`, Platform Tools (incluye `adb`) y NDK `27.1.12297006`, que son las versiones declaradas por el scaffold actual. Android Studio es opcional; el wrapper del proyecto usa Gradle `9.4.1`.
- `WebSocket` y `AppState` integrados en React Native; no se añadió una biblioteca de WebSocket ni de gráficas.
- Dependencias de desarrollo del template: React Native CLI, Metro, Babel, TypeScript, ESLint, Jest y Prettier. Se instalan junto con las dependencias de `package.json` usando npm.

#### Dependencias npm declaradas

La lista exacta también está en [`APK-Android/package.json`](APK-Android/package.json). Estas son las dependencias directas; los paquetes transitivos los resuelve npm.

| Tipo | Paquete | Versión declarada |
|---|---|---:|
| Runtime | `react` | `19.3.0` |
| Runtime | `react-native` | `0.88.0` |
| Runtime | `@react-native/new-app-screen` | `0.88.0` (del template; la pantalla actual no lo importa) |
| Desarrollo | `@babel/core` | `^7.25.2` |
| Desarrollo | `@babel/preset-env` | `^7.25.3` |
| Desarrollo | `@babel/runtime` | `^7.25.0` |
| Desarrollo | `@react-native-community/cli` | `20.2.0` |
| Desarrollo | `@react-native-community/cli-platform-android` | `20.2.0` |
| Desarrollo | `@react-native-community/cli-platform-ios` | `20.2.0` (incluido por el template; iOS no forma parte de este MVP) |
| Desarrollo | `@react-native/babel-preset` | `0.88.0` |
| Desarrollo | `@react-native/eslint-config` | `0.88.0` |
| Desarrollo | `@react-native/jest-preset` | `0.88.0` |
| Desarrollo | `@react-native/metro-config` | `0.88.0` |
| Desarrollo | `@react-native/typescript-config` | `0.88.0` |
| Desarrollo | `@types/jest` | `^29.5.13` |
| Desarrollo | `@types/react` | `^19.2.0` |
| Desarrollo | `@types/react-test-renderer` | `^19.1.0` |
| Desarrollo | `eslint` | `^8.19.0` |
| Desarrollo | `jest` | `^29.6.3` |
| Desarrollo | `prettier` | `2.8.8` |
| Desarrollo | `react-test-renderer` | `19.3.0` |
| Desarrollo | `typescript` | `^6.0.3` |

Las versiones que empiezan con `^` permiten actualizaciones compatibles. `package-lock.json` fija las versiones transitivas resueltas por npm.

### Agente Windows

- Windows 10/11 x64 y .NET SDK `10.0`.
- ASP.NET Core/Kestrel está incluido por el SDK de .NET; `System.Text.Json`, WebSocket, `NativeLibrary` y P/Invoke forman parte de la plataforma .NET. Sensores opcionales: `LibreHardwareMonitorLib` 0.9.6 (`Ejecutable-Windows/PanelPc.Agent.csproj`).
- `GetSystemTimes` y `GlobalMemoryStatusEx` son APIs de Windows.
- NVML es una API nativa del controlador NVIDIA. No se distribuye `nvml.dll` con el proyecto; el agente busca la biblioteca instalada por NVIDIA y continúa con CPU/RAM si no la encuentra.

### Teléfono y conexión

- Teléfono Android con cable USB de datos.
- Activar Opciones de desarrollador y Depuración USB, conectarlo y aceptar la autorización ADB en la pantalla del teléfono.
- Android SDK Platform Tools instaladas para disponer de `adb`.

### Estado de herramientas de esta PC (2026-10-24)

| Herramienta | Estado registrado | Requisito del proyecto |
|---|---|---|
| Node.js | `24.22.1`, instalado | `>=22.11.0` |
| npm | `11.19.1`, instalado junto con Node | Instalado junto con Node |
| JDK | Eclipse Temurin `17.0.20.1`, extraído en `%LOCALAPPDATA%\Programs\Temurin17` | JDK 17 |
| .NET SDK | `10.0.402`, instalado | SDK 10.0 |
| Android Studio | No instalado; no es necesario para compilar con Gradle desde terminal | Opcional; instalador oficial en https://developer.android.com/studio |
| Android SDK Platform | `android-37.0`, revisión 2 | Compile SDK 37 |
| Android Build Tools | `36.0.0` y `37.0.0` | `37.0.0` declarado; Gradle también instaló 36.0.0 |
| Android Platform Tools / ADB | `37.0.1`; ADB `1.0.41` | Requerido para instalación y depuración USB |
| CMake / Android NDK | CMake `3.22.1`, NDK `27.1.12297006` | Versiones requeridas por el proyecto |
| Paquetes npm del proyecto | Instalados; `package-lock.json` guardado | `npm ci` para reproducir la instalación |
| Agente Windows | `dotnet build` completado con 0 errores y 0 advertencias | .NET SDK 10.0 |

El JDK se extrajo en el perfil del usuario porque el instalador MSI requería privilegios administrativos. La ubicación esperada del SDK es `%LOCALAPPDATA%\Android\Sdk`. La sesión de revisión no confirmó variables permanentes en `HKCU\Environment`; véase la nota y los comandos de continuidad al final de este README.

## Instalación de herramientas en Windows

Estos son comandos sugeridos para preparar otra máquina. La PC descrita en el inventario anterior ya tiene esas dependencias básicas; no ejecutes instaladores de nuevo en ella salvo que falte una herramienta.

En PowerShell o Windows Terminal con WinGet para .NET y Node/JDK (si tus fuentes de WinGet tienen esos paquetes):

```powershell
winget install --id OpenJS.NodeJS.LTS --exact
winget install --id Microsoft.OpenJDK.17 --exact
winget install --id Microsoft.DotNet.SDK.10 --exact
```

La guía oficial de React Native también documenta `choco install -y nodejs-lts microsoft-openjdk17` si ya usas Chocolatey.

Android Studio puede instalarse desde [la página oficial](https://developer.android.com/studio) para usar su interfaz gráfica y SDK Manager. También es posible usar `sdkmanager` desde una terminal:

```powershell
sdkmanager "platforms;android-37" "build-tools;37.0.0" "platform-tools" "ndk;27.1.12297006"
sdkmanager --licenses
```

La ruta SDK suele ser `%LOCALAPPDATA%\Android\Sdk`. Configura `ANDROID_HOME` para esa ruta y añade `platform-tools` al `PATH` si Windows no encuentra `adb`. Reabre la terminal tras cambiar variables de entorno. Las versiones de SDK pueden cambiar con el template; si un paquete ya no aparece, consulta el SDK Manager y conserva la versión declarada por los archivos Android del proyecto.

Referencias para instalar el entorno: [guía React Native para Windows/Android](https://reactnative.dev/docs/set-up-your-environment), [Android SDK Manager](https://developer.android.com/studio/intro/update) y [WinGet de .NET](https://learn.microsoft.com/en-us/dotnet/core/install/windows).

## Instalar dependencias del proyecto

Desde la raíz `Desarrollo`:

```powershell
Set-Location .\APK-Android
npm install
Set-Location ..\Ejecutable-Windows
dotnet restore
```

`npm install` instala las dependencias declaradas en `package.json`. `dotnet restore` prepara el proyecto y descarga `LibreHardwareMonitorLib` para consultar sensores compatibles.

Para temperaturas del CPU Ryzen y algunos sensores de placa, LHM 0.9.5 o posterior también requiere el controlador PawnIO. Instálalo desde la [publicación oficial PawnIO.Setup](https://github.com/namazso/PawnIO.Setup/releases) en una consola elevada (`PawnIO_setup.exe -install -silent`), verifica con `sc.exe query PawnIO` que el estado sea `RUNNING` y reinicia el agente. La página 5 debe indicar `ADMINISTRADOR`.

## Conectar el teléfono y usar el MVP

1. Conecta el celular a Windows por USB, habilita depuración USB y acepta el diálogo de autorización.
2. En una terminal, confirma que ADB ve el teléfono y configura el puente:

   ```powershell
   adb devices
   adb reverse tcp:8081 tcp:8081
   adb reverse tcp:8765 tcp:8765
   ```

3. Compila el agente y ejecútalo con permisos de administrador para habilitar CPU y sensores de ventilador que requieran acceso al controlador:

   ```powershell
   Set-Location .\Ejecutable-Windows
   dotnet build .\PanelPc.Agent.csproj --configuration Debug
   .\Iniciar-Agente-Administrador.cmd
   ```

   Acepta el aviso UAC de Windows. Debe abrirse una consola del agente e indicar que escucha en `localhost:8765`; déjala abierta mientras usas el panel. En la quinta página debe aparecer `ADMINISTRADOR`. Si Windows no permite elevar desde la terminal integrada, abre `bin\Debug\net10.0-windows\PanelPc.Agent.exe` desde el Explorador con clic derecho → `Ejecutar como administrador`.

4. En una tercera terminal, desde el proyecto Android:

   ```powershell
   Set-Location .\APK-Android
   npm run android
   ```

   React Native compila e instala la variante de desarrollo en el teléfono. El primer build puede tardar mientras Gradle resuelve dependencias.

Para crear solo el APK de depuración después de instalar dependencias:

```powershell
Set-Location .\APK-Android\android
.\gradlew.bat assembleDebug
```

El archivo se genera en `APK-Android/android/app/build/outputs/apk/debug/app-debug.apk`. La configuración de firma de producción no está preparada; no distribuyas una variante release hasta crear y configurar una clave de firma propia.

El endpoint de salud se puede abrir en el navegador de Windows en `http://127.0.0.1:8765/health`. Una respuesta `{"status":"ok"}` confirma que el proceso HTTP está activo; no confirma que NVML o el cable ya funcionen.

## Contrato de telemetría

La APK recibe un objeto JSON por segundo. Las propiedades siguen el estilo camelCase de `System.Text.Json` con valores web predeterminados:

```json
{
  "capturedAtUtc": "2026-10-24T12:00:00+00:00",
  "cpuUsagePercent": 18.4,
  "gpuName": "NVIDIA ...",
  "gpuUsagePercent": 42,
  "gpuTemperatureCelsius": 55,
  "ramUsedBytes": 8589934592,
  "ramTotalBytes": 17179869184
}
```

Cada métrica numérica puede ser `null` si Windows o el controlador no ofrece la lectura. La primera muestra de CPU también es `null`, porque aún no hay dos valores para calcular el porcentaje. RAM se transporta en bytes y se presenta en GiB (`1024³`) en la APK.

Las listas `motherboardTemperatureSensors`, `fanReadings`, `cpuClockReadings` y `gpuClockReadings` entregan las lecturas nombradas que publican los controladores. No se puede garantizar una lectura por cada conector físico: algunas placas solo exponen parte de los ventiladores/sensores a las bibliotecas de monitorización. `agentIsElevated` informa si el agente recibió el token de administrador.

## Consumo y límites

- Sin cliente, el proceso mantiene Kestrel escuchando en loopback, pero no lee sensores ni crea un temporizador de muestreo.
- Con cliente, se consulta una vez por segundo. Cada consulta de GPU se hace en el proceso, sin iniciar `nvidia-smi` repetidamente.
- Los registros del servidor están deshabilitados para evitar salida repetitiva en consola.
- No se ha medido CPU, RAM ni efecto sobre juegos. “Bajo impacto” es un objetivo por medir en el PC real, no una garantía.
- El endpoint no tiene autenticación y el WebSocket no cifra el tráfico. Está ligado a loopback y el flujo esperado es el puente ADB local; no cambies el binding a `0.0.0.0` para exponerlo a una red.
- El permiso de tráfico en claro de Android se limita a `localhost`, porque el enlace local usa `ws://` y no TLS. La configuración base niega HTTP claro a otros dominios.

## Pendiente de validar en otros equipos

- Confirmar sensores de temperatura de CPU/placa/RAM y GPU en otros modelos y controladores. En esta PC, Ryzen 5 3600, los sensores funcionan con PawnIO instalado y el agente elevado.
- Comprobar ADB reverse tras desconectar el cable, reiniciar el teléfono y retornar desde segundo plano.
- Medir uso del agente en reposo y mientras se juega.
- Verificar la visualización en orientación y resolución del celular elegido.
- Decidir si después del prototipo se mantiene ADB reverse o se implementa un transporte USB que no requiera depuración.

## Continuación de la corrección en esta PC (2026-10-24)

Esta sección conserva el estado de la sesión para que otro agente pueda continuar sin repetir la investigación. El usuario autorizó instalar dependencias y usar el teléfono conectado por USB.

### Entorno instalado

- Windows, proyecto ubicado en `D:\Data_Pesonal\Proyects\admin_recursus_pc\admin_recursos_pc`.
- Node.js 24.22.1 y npm 11.19.1.
- .NET SDK 10.0.402.
- Eclipse Temurin JDK 17.0.20.1 extraído para el usuario en `%LOCALAPPDATA%\Programs\Temurin17\PFiles64\Eclipse Adoptium\jdk-17.0.20.101-hotspot`.
- Android SDK en `%LOCALAPPDATA%\Android\Sdk`: Android platform 37, Build Tools 36.0.0 y 37.0.0, Platform Tools, CMake 3.22.1 y NDK 27.1.12297006.
- `npm install` ya ejecutado en `APK-Android`; existe `package-lock.json`. Se quitó `react-native-safe-area-context`, que no se importa en la app y cuya generación CMake fallaba por longitud de ruta en Windows.
- El agente .NET ya compiló con 0 errores y 0 advertencias.
- El teléfono TECNO CE9 (`05930250AB004681`) autorizó ADB y recibió la APK Debug.

Las variables de entorno permanentes de usuario (`JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` y `DOTNET_ROOT`) no aparecen en `HKCU\Environment` en esta revisión. Las compilaciones de la sesión se ejecutan definiéndolas en PowerShell antes de Gradle. Si se necesita ADB desde una nueva terminal, definir también `HOME`, `USERPROFILE` y `ANDROID_USER_HOME`; ADB dio `Cannot mkdir '\.android'` cuando se ejecutó sin ello.

### Error observado en el teléfono

La primera instalación Debug mostró `java.lang.RuntimeException: Unable to load script.` El logcat confirmó que buscaba Metro en `localhost:8081`; no era un fallo de instalación nativa. Debug no incluye el bundle JS y requiere Metro activo, además de `adb reverse tcp:8081 tcp:8081`. Para una APK autónoma que abra sin Metro, compilar `release`, que integra `index.android.bundle`.

### Prueba Debug completada

El 2026-10-24 se reinstaló la APK Debug en el TECNO CE9 y se ejecutó una prueba en vivo. Se levantaron Metro y el agente .NET en segundo plano, y se aplicaron los puentes `adb reverse tcp:8081 tcp:8081` y `adb reverse tcp:8765 tcp:8765`. Metro respondió `200` (`packager-status:running`), `/health` respondió `{"status":"ok"}` y logcat registró `Running "PanelPC"` sin el error `Unable to load script`.

La pantalla mostró estado `CONECTADO`, lecturas de CPU, NVIDIA GeForce GTX 1050 Ti, temperatura GPU reportada por NVML y RAM. Esto confirma que la APK Debug carga y recibe telemetría real por USB. Metro (Node) y el agente (dotnet) quedaron ejecutándose ocultos en segundo plano; los registros están en `%TEMP%\admin-recursus-metro.log` y `%TEMP%\admin-recursus-agent.log`. Para probar de nuevo, iniciar esos dos procesos, aplicar ambos `adb reverse` y abrir la app. No se necesita construir Release para esta prueba de desarrollo.

El intento de `assembleRelease` quedó pendiente por un bloqueo en `app\\.cxx\\RelWithDebInfo\\...\\CMakeCache.txt` (`The process cannot access the file because it is being used by another process`). Hubo dos intentos de compilación solapados durante aquella sesión. No ejecutar Gradle concurrentemente ni borrar `.cxx` mientras haya un build activo. Release solo es necesario si se desea una APK autónoma sin Metro. Limitar ese build al teléfono (ARM64) con `-PreactNativeArchitectures=arm64-v8a` produciría una APK específica ARM64.

### Próximos pasos concretos

1. Para repetir la prueba Debug, comprobar que el teléfono sigue autorizado, iniciar Metro y el agente, configurar ambos `adb reverse` y abrir `com.panelpcusbusb`.
2. Solo si se necesita una APK autónoma, asegurarse de que no quede un build Gradle en curso. No matar procesos Java sin identificar primero su comando, porque los daemons Gradle pueden ser compartidos. Desde `APK-Android\android`, ejecutar un único build Release en PowerShell con el JDK y SDK instalados:

   ```powershell
   $env:JAVA_HOME = Join-Path $env:LOCALAPPDATA 'Programs\Temurin17\PFiles64\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
   $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
   $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
   .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain
   ```

3. Verificar que exista `APK-Android\android\app\build\outputs\apk\release\app-release.apk` y que la APK contenga `assets/index.android.bundle` (se puede inspeccionar renombrando una copia a `.zip` o con `jar tf`).
4. Con el TECNO conectado y autorizado, instalar/actualizar con `adb install -r <ruta-absoluta-a-app-release.apk>`, abrir `com.panelpcusbusb` y revisar `adb logcat` para confirmar que ya no aparece `Unable to load script`.
5. Esta firma Release usa temporalmente la clave `debug.keystore` configurada en `app/build.gradle`; sirve para pruebas locales y actualizaciones en este teléfono, no es firma para publicar en Play Store. La APK es ARM64 si se usa la opción indicada.

Para ADB en PowerShell cuando las variables de perfil no estén disponibles:

```powershell
$env:HOME = $env:USERPROFILE = 'C:\Users\Edmilzon'
$env:ANDROID_USER_HOME = Join-Path $env:USERPROFILE '.android'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
& $adb devices -l
```

## Referencias técnicas oficiales

- React Native: [configurar entorno Android](https://reactnative.dev/docs/set-up-your-environment).
- Android: [ADB reverse y servidor local](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server), [configuración de seguridad de red](https://developer.android.com/privacy-and-security/security-config), [SDK Manager](https://developer.android.com/studio/intro/update).
- Microsoft: [Minimal APIs en ASP.NET Core](https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis), [`GetSystemTimes`](https://learn.microsoft.com/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes), [`GlobalMemoryStatusEx`](https://learn.microsoft.com/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex), [instalar .NET en Windows](https://learn.microsoft.com/dotnet/core/install/windows).
- NVIDIA: [guía de referencia NVML](https://docs.nvidia.com/deploy/nvml-api/nvml-api-reference.html), [consultas de dispositivos NVML](https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceQueries.html).
- Sensores: [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor), [paquete LibreHardwareMonitorLib 0.9.6](https://www.nuget.org/packages/LibreHardwareMonitorLib/0.9.6).
- CPU Ryzen: [MSI explica la selección de CPU temperature en el monitoreo de Afterburner](https://www.msi.com/blog/msi-afterburner-on-screen-display/); [AMD Ryzen Master Monitoring SDK oficial](https://www.amd.com/es/developer/ryzen-master-monitoring-sdk.html).

### Estado de la interfaz y sensores (2026-10-24)

- `APK-Android/App.tsx` implementa cinco páginas horizontales: panel CPU/GPU, placa y núcleos, ventiladores, discos e información general del PC. La primera incluye indicadores circulares CPU/GPU y bloques RAM/VRAM. La pestaña de discos muestra inventario físico, capacidad usada, volúmenes, lectura/escritura, temperatura SMART y vida útil cuando Windows y el firmware los publican. Al cambiar el ancho por orientación, vuelve a la página principal.
- Las temperaturas de CPU, GPU, placa y RAM nulas, no finitas o `<= 0` se presentan como `—°C`; no se representa el cero del sensor como temperatura válida. Los relojes nulos se muestran como `—`.
- El TECNO CE9 conectado recibió y ejecutó la APK Debug ARM64. La captura de la primera página confirmó conexión, uso de CPU/GPU, GPU a 37°C, RAM 6.6/7.9 GB y VRAM 0.7/4.0 GB. La página de detalles identificó Ryzen 5 3600 (12 hilos), ASRock B550M Phantom Gaming 4 y GeForce GTX 1050 Ti.
- En esta PC el agente normal no tenía acceso al sensor Ryzen. La causa era que faltaba PawnIO, no solo la elevación. Se instaló PawnIO 2.2.0 desde la publicación oficial, se verificó firma Authenticode válida (`namazso.eu`) y servicio `PawnIO` en estado `RUNNING`.
- `Ejecutable-Windows/Iniciar-Agente-Administrador.cmd` comprueba el puerto del agente y solicita elevación UAC para el ejecutable compilado. Pulsa Sí; en la página 5 debe aparecer `ADMINISTRADOR`. Si Windows deniega el inicio desde la terminal integrada, abre `bin\\Debug\\net10.0-windows\\PanelPc.Agent.exe` desde el Explorador con clic derecho → `Ejecutar como administrador`.
- El agente exporta lecturas individuales de fans y clocks por hardware cuando LHM/NVML las publica; un conector que el controlador o la placa no exponen no se puede inferir por software. La pestaña de discos combina `Win32_DiskDrive`/`MSFT_PhysicalDisk`, los volúmenes de Windows, contadores `PhysicalDisk` y sensores Storage de LibreHardwareMonitor. La temperatura SMART y la vida útil quedan como no disponibles si el firmware/controlador no las publica.
- En la lectura del 2026-10-24, Windows detectó dos unidades físicas: KIOXIA NVMe de 256 GB (C:) y TOSHIBA SATA de 1 TB (D:). Si se esperan seis discos, confirmar en Administración de discos/BIOS que los otros cuatro estén presentes y en línea; la app mostrará todas las unidades que Windows exponga.
- Validaciones recientes: `npx tsc --noEmit` y `dotnet build .\\PanelPc.Agent.csproj --configuration Debug --no-restore` correctos (0 errores y 0 advertencias). Se reinició la APK Debug por USB y se comprobaron visualmente las páginas con telemetría en vivo.
- La APK Debug actual se reconstruyó e instaló por USB el 2026-10-24. Se comprobó `Running "PanelPC"`, conexión en vivo y cinco páginas; no apareció `Unable to load script`. La ruta de lanzamiento usa Metro en el puerto 8081 y el agente en 8765.
- La captura de la página 5 confirmó `ADMINISTRADOR`. Se instaló y ejecutó PawnIO 2.2.0 (instalador firmado; SHA-256 `1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032`); `sc.exe query PawnIO` informó `RUNNING`.
- Tras reiniciar el agente elevado, LHM detectó `Core (Tctl/Tdie) = 73.125 °C`, `CCD1 (Tdie) = 73.25 °C` y SoC `53.24 °C` en el Ryzen 5 3600. La APK Debug conectada mostró CPU `73 °C`, GPU `39 °C` y temperatura de RAM reportada `52 °C`, además de uso en vivo.
- El informe crudo de sensores mostró Nuvoton `CPU Core = null`, pero el sensor térmico del CPU llega desde el hardware AMD `/amdcpu/0/temperature/2`. El agente usa `Core (Tctl/Tdie)` de LHM para la temperatura principal.
- El estado final es app conectada y agente elevado. Para futuras sesiones, mantén PawnIO instalado, inicia `Iniciar-Agente-Administrador.cmd`, confirma `ADMINISTRADOR` en página 5 y deja el agente abierto.

### Pestaña de discos (2026-10-24)

- Se agregó una quinta pestaña antes de Información del PC con tarjetas por disco físico: modelo, bus, tipo de medio, estado, capacidad y porcentaje usado, volúmenes/letras, lectura y escritura por segundo, temperatura SMART y vida útil cuando estén disponibles.
- El agente usa WMI para inventario y volúmenes, los contadores `PhysicalDisk` de Windows para tasas de E/S, y LibreHardwareMonitor para temperatura/vida. Se agregaron referencias NuGet `System.Management` y `System.Diagnostics.PerformanceCounter` 10.0.2.
- La lectura administrativa de esta PC mostró solo dos discos físicos: KIOXIA NVMe 256 GB (C:) y TOSHIBA SATA 1 TB (D:), no seis. La página enumera lo que Windows detecta en cada ejecución.
- `dotnet build ... --no-restore` terminó sin errores y `npx tsc --noEmit` pasó. `assembleDebug` compiló correctamente y la APK actualizada se instaló por ADB.
- El primer inicio de la nueva telemetría se hizo con el agente sin elevar y devolvió una lista de discos vacía. Una nueva elevación UAC para lanzar `Iniciar-Agente-Administrador.ps1` fue cancelada; al continuar, iniciar `Ejecutable-Windows/Iniciar-Agente-Administrador.cmd` como administrador y aceptar UAC para que WMI y SMART llenen la pestaña.
