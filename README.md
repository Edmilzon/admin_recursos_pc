# Admin Recursos PC

Panel Android para reutilizar un celular como pantalla táctil de los recursos de una PC con Windows.

## Proyectos

- **APK Android — APK-Android/**: React Native y TypeScript. Incluye una pantalla inicial con tarjetas para CPU, GPU, temperatura de GPU y RAM.
- **Agente Windows — Ejecutable-Windows/**: aplicación C# con .NET 10 y un modelo para transportar lecturas de telemetría.

## Estado actual

Este repositorio contiene el código inicial. La APK muestra guiones mientras no haya datos reales. El agente Windows todavía no consulta sensores ni se comunica con el teléfono.

La ruta de comunicación por USB y las fuentes fiables para leer los sensores del equipo quedan pendientes de validar antes de implementarlas. No se incluyen lecturas simuladas.

## Herramientas

- Node.js y npm
- React Native CLI y Android SDK para desarrollar y generar la APK
- .NET SDK 10 para el agente de Windows

Las dependencias del proyecto Android no se instalaron y ningún proyecto se compiló como parte de esta preparación.
