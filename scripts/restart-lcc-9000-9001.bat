@echo off
setlocal
chcp 65001 >nul

set "ROOT=D:\Lucas Core v0.1"
set "LOGDIR=%ROOT%\data\system-logs"
set "STAMP=%DATE% %TIME%"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul

echo [%STAMP%] Restarting LCC 9000/9001...
echo Root: %ROOT%

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports=@(9000,9001); foreach($port in $ports){ Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $pid=$_.OwningProcess; if($pid -and $pid -ne $PID){ try { Stop-Process -Id $pid -Force -ErrorAction Stop; Write-Host ('Stopped port {0} pid {1}' -f $port,$pid) } catch { Write-Host ('Failed to stop port {0} pid {1}: {2}' -f $port,$pid,$_.Exception.Message) } } } }"

timeout /t 2 /nobreak >nul

start "LCC API 9001" powershell -NoProfile -ExecutionPolicy Bypass -NoExit -Command "Set-Location -LiteralPath '%ROOT%'; .\scripts\dev-api.ps1 -Port 9001"
timeout /t 2 /nobreak >nul
start "LCC Web 9000" powershell -NoProfile -ExecutionPolicy Bypass -NoExit -Command "Set-Location -LiteralPath '%ROOT%'; .\scripts\dev-web.ps1 -Port 9000 -ApiOrigin http://127.0.0.1:9001"

echo Started visible windows for 9001 and 9000.
echo Close this window after checking http://127.0.0.1:9000
pause
