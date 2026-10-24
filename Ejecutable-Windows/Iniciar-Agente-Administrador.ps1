$ErrorActionPreference = 'Stop'

$agentPath = Join-Path $PSScriptRoot 'bin\Debug\net10.0-windows\PanelPc.Agent.exe'
if (-not (Test-Path -LiteralPath $agentPath)) {
    throw "No existe el agente compilado: $agentPath. Compila PanelPc.Agent.csproj primero."
}

$listener = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $existingAgent = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $expectedPath = [System.IO.Path]::GetFullPath($agentPath)
    $runningPath = if ($existingAgent.Path) { [System.IO.Path]::GetFullPath($existingAgent.Path) } else { $null }
    if ($runningPath -eq $expectedPath) {
        Stop-Process -Id $existingAgent.Id -Force
        Start-Sleep -Milliseconds 500
    }
    else {
        throw "El puerto 8765 ya lo usa otro proceso (PID $($listener.OwningProcess)); no lo cerré."
    }
}

Start-Process -FilePath $agentPath -WorkingDirectory (Split-Path -Parent $agentPath) -Verb RunAs
