@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Iniciar-Agente-Administrador.ps1"
if errorlevel 1 pause
