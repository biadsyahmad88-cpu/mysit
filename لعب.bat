@echo off
chcp 65001 >nul
title غرفة الهروب - Node.js
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Node.js غير مثبت - حمّله من nodejs.org ثم شغّل هذا الملف مرة ثانية
  start https://nodejs.org
  pause
  exit /b
)

rem === فتح المنفذ 3000 في جدار الحماية - مرة وحدة فقط ===
netsh advfirewall firewall show rule name="EscapeGame3000" >nul 2>nul
if errorlevel 1 (
  echo  اضغط نعم - Yes - للسماح للطلاب بالدخول من التلفون...
  powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -Wait -ArgumentList '/c netsh advfirewall firewall add rule name=EscapeGame3000 dir=in action=allow protocol=TCP localport=3000 profile=any'"
)

rem === تحميل أداة الرابط الأونلاين - مرة وحدة فقط ===
if not exist cloudflared.exe (
  echo  تحميل أداة الرابط الأونلاين لأول مرة...
  curl -L -f -s -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  if errorlevel 1 del cloudflared.exe 2>nul
)

node server.js
pause
