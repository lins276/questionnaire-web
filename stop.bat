@echo off
chcp 65001 >nul
taskkill /FI "WINDOWTITLE eq 正大杯问卷后端" /F 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo 服务器已停止
pause
