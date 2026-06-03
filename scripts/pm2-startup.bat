@echo off
REM LCC Core PM2 startup. Keep PM2_HOME explicit so CLI and Task Scheduler share one daemon.
set PM2_HOME=C:\Users\hysra\.pm2

if not exist "%PM2_HOME%" mkdir "%PM2_HOME%"
echo [%date% %time%] LCC Core PM2 startup PM2_HOME=%PM2_HOME% >> "%PM2_HOME%\lcc-startup.log"

cd /d "D:\Lucas Core v0.1"

call pm2 start ecosystem.config.cjs --only lcc-api-9001,lcc-web-9000,lcc-ledger-9100 >> "%PM2_HOME%\lcc-startup.log" 2>&1
call pm2 save --force >> "%PM2_HOME%\lcc-startup.log" 2>&1

echo [%date% %time%] LCC Core PM2 startup complete >> "%PM2_HOME%\lcc-startup.log"
