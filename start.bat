@echo off
chcp 65001 >nul
title 正大杯问卷后端
cd /d "%~dp0"

echo.
echo ================================================
echo   正大杯问卷后端 启动中...
echo ================================================
echo.
echo   问卷:  http://localhost:3000/
echo   Admin: http://localhost:3000/admin.html
echo   密码:  zhengda2026
echo.
echo   服务器已最小化到任务栏后台运行
echo   关闭方式：双击同目录 stop.bat
echo ================================================
echo.

rem 后台启动（最小化窗口），黑窗口自己退出
start "" /min cmd /c "cd /d "%~dp0" && node server.js"

echo 启动指令已发出，3 秒后自动关闭此窗口...
timeout /t 3 >nul
