# Admin Recursos PC

Panel Android para reutilizar un celular como tablero táctil de los recursos de una PC Windows. El MVP es de solo lectura: muestra uso de CPU, uso y temperatura de la primera GPU NVIDIA que NVML pueda consultar, y memoria RAM usada/total.

> **Estado:** código del MVP escrito; compilación y prueba con hardware pendientes. Los comandos de instalación y ejecución de esta guía son instrucciones para usar después. No se ejecutaron instalaciones, builds ni pruebas como parte de esta entrega.

## Qué hace

- El agente de Windows consulta CPU y RAM mediante APIs de Windows. Solo calcula lecturas mientras hay una conexión WebSocket del panel.
- Para la primera GPU NVIDIA, el agente intenta cargar NVML (`nvml.dll`) desde el controlador instalado. Uso y temperatura se envían como `null` cuando la biblioteca, el controlador o el sensor no los exponen.
- El agente abre un servidor WebSocket en `127.0.0.1:8765`, acepta un solo panel y envía un objeto JSON cada segundo. No escucha en la red local.
- La APK muestra las lecturas reales, la hora de la última muestra y el estado de conexión. No genera datos de ejemplo; descarta las lecturas al desconectarse.
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
| Uso de CPU | `GetSystemTimes` de Windows; porcentaje calculado entre dos muestras. | La primera muestra de cada conexión sirve de base y se representa como no disponible. No lee temperatura AMD. |
| RAM | `GlobalMemoryStatusEx`; muestra GiB usados, total y porcentaje. | No se lee memoria virtual ni se guarda historial. |
| Uso/temperatura GPU | NVIDIA NVML cargada dinámicamente; usa la primera GPU detectada. | Puede no estar expuesta por algunos modelos/controladores o configuraciones; el dato ausente es `null`. |
| Enlace | WebSocket de ASP.NET Core en loopback; una conexión a la vez. | El transporte USB usa ADB reverse y requiere depuración USB. No es una conexión USB directa para el usuario final. |
| Reconexión | La app reintenta cada 2 s y elimina datos viejos al cerrar el socket. | `adb reverse` debe volver a configurarse si se pierde o reinicia el puente. |
| Pausa en segundo plano | `AppState` cierra el socket al salir del primer plano. | El agente sigue escuchando localmente, pero deja de sondear sensores. |

Quedan fuera de este MVP: temperaturas AMD/placa base, VRAM, frecuencias, ventiladores, potencia, FPS, discos/red, historial, nube, control de hardware, servicio de Windows, instalación automática y múltiples GPU.

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
        ├── SystemTelemetryReader.cs    # CPU y RAM mediante Win32
        └── NvidiaGpuReader.cs          # Adaptador opcional de NVML
```

## Herramientas y bibliotecas

### APK Android

- React Native `0.88.0`, React `19.3.0` y TypeScript (`package.json` es la referencia exacta).
- Node.js `22.11.0` o superior y npm.
- JDK `17`.
- Android Studio, Android SDK Platform `37`, Build Tools `37.0.0`, Platform Tools (incluye `adb`) y NDK `27.1.12297006`, que son las versiones declaradas por el scaffold actual. El wrapper del proyecto usa Gradle `9.4.1`.
- `WebSocket` y `AppState` integrados en React Native; no se añadió una biblioteca de WebSocket ni de gráficas.
- Dependencias de desarrollo del template: React Native CLI, Metro, Babel, TypeScript, ESLint, Jest y Prettier. No se instalaron en esta entrega.

### Agente Windows

- Windows 10/11 x64 y .NET SDK `10.0`.
- ASP.NET Core/Kestrel está incluido por el SDK de .NET; `System.Text.Json`, WebSocket, `NativeLibrary` y P/Invoke forman parte de la plataforma .NET. No hay paquetes NuGet externos.
- `GetSystemTimes` y `GlobalMemoryStatusEx` son APIs de Windows.
- NVML es una API nativa del controlador NVIDIA. No se distribuye `nvml.dll` con el proyecto; el agente busca la biblioteca instalada por NVIDIA y continúa con CPU/RAM si no la encuentra.

### Teléfono y conexión

- Teléfono Android con cable USB de datos.
- Activar Opciones de desarrollador y Depuración USB, conectarlo y aceptar la autorización ADB en la pantalla del teléfono.
- Android SDK Platform Tools instaladas para disponer de `adb`.

## Instalación de herramientas en Windows

Estos son comandos sugeridos para preparar otra máquina; **no se ejecutaron durante esta entrega**. Si ya tienes una herramienta, no vuelvas a instalarla.

En PowerShell o Windows Terminal con WinGet para .NET y Node/JDK (si tus fuentes de WinGet tienen esos paquetes):

```powershell
winget install --id OpenJS.NodeJS.LTS --exact
winget install --id Microsoft.OpenJDK.17 --exact
winget install --id Microsoft.DotNet.SDK.10 --exact
```

La guía oficial de React Native también documenta `choco install -y nodejs-lts microsoft-openjdk17` si ya usas Chocolatey.

Instala Android Studio desde [la página oficial](https://developer.android.com/studio) y, en **Tools → SDK Manager**, instala las versiones que aparecen en `APK-Android/android/build.gradle` y `gradle.properties`. Si ya está instalado `sdkmanager`, se pueden pedir desde una terminal:

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

`npm install` instala las dependencias declaradas en `package.json`. `dotnet restore` prepara el proyecto; el agente no tiene paquetes NuGet de terceros.

## Conectar el teléfono y usar el MVP

1. Conecta el celular a Windows por USB, habilita depuración USB y acepta el diálogo de autorización.
2. En una terminal, confirma que ADB ve el teléfono y configura el puente:

   ```powershell
   adb devices
   adb reverse tcp:8765 tcp:8765
   ```

3. En otra terminal, inicia el agente:

   ```powershell
   Set-Location .\Ejecutable-Windows
   dotnet run
   ```

   Debe indicar que escucha en `localhost:8765`. Déjalo abierto mientras uses el panel.

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

## Consumo y límites

- Sin cliente, el proceso mantiene Kestrel escuchando en loopback, pero no lee sensores ni crea un temporizador de muestreo.
- Con cliente, se consulta una vez por segundo. Cada consulta de GPU se hace en el proceso, sin iniciar `nvidia-smi` repetidamente.
- Los registros del servidor están deshabilitados para evitar salida repetitiva en consola.
- No se ha medido CPU, RAM ni efecto sobre juegos. “Bajo impacto” es un objetivo por medir en el PC real, no una garantía.
- El endpoint no tiene autenticación y el WebSocket no cifra el tráfico. Está ligado a loopback y el flujo esperado es el puente ADB local; no cambies el binding a `0.0.0.0` para exponerlo a una red.
- El permiso de tráfico en claro de Android se limita a `localhost`, porque el enlace local usa `ws://` y no TLS. La configuración base niega HTTP claro a otros dominios.

## Pendiente de validar en los equipos reales

- Compilar APK y agente con las versiones instaladas de Android SDK, Gradle, JDK y .NET.
- Confirmar modelo/version de Android, GPU NVIDIA y controlador; verificar lecturas de uso y temperatura.
- Comprobar ADB reverse en el teléfono por USB, reconexión tras desconectar el cable y retorno desde segundo plano.
- Medir uso del agente en reposo y mientras se juega.
- Verificar la visualización en orientación y resolución del celular elegido.
- Decidir si después del prototipo se mantiene ADB reverse o se implementa un transporte USB que no requiera depuración.

## Referencias técnicas oficiales

- React Native: [configurar entorno Android](https://reactnative.dev/docs/set-up-your-environment).
- Android: [ADB reverse y servidor local](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server), [configuración de seguridad de red](https://developer.android.com/privacy-and-security/security-config), [SDK Manager](https://developer.android.com/studio/intro/update).
- Microsoft: [Minimal APIs en ASP.NET Core](https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis), [`GetSystemTimes`](https://learn.microsoft.com/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes), [`GlobalMemoryStatusEx`](https://learn.microsoft.com/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex), [instalar .NET en Windows](https://learn.microsoft.com/dotnet/core/install/windows).
- NVIDIA: [guía de referencia NVML](https://docs.nvidia.com/deploy/nvml-api/nvml-api-reference.html), [consultas de dispositivos NVML](https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceQueries.html).
