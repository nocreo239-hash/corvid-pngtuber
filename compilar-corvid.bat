@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set LOG=%~dp0build-log.txt
echo Compilando Corvid PNGtuber... (no cierres esta ventana)
> "%LOG%" echo === procesos que podrian bloquear dist ===
tasklist /FI "IMAGENAME eq Corvid PNGtuber.exe" >> "%LOG%" 2>&1
tasklist /FI "IMAGENAME eq electron.exe" >> "%LOG%" 2>&1
tasklist /FI "IMAGENAME eq app-builder.exe" >> "%LOG%" 2>&1
>> "%LOG%" echo === npm run dist (salida en dist-nuevo) ===
call npx electron-builder --win nsis portable --config.directories.output=dist-nuevo >> "%LOG%" 2>&1
>> "%LOG%" echo DIST_EXIT=!ERRORLEVEL!
>> "%LOG%" echo FIN
