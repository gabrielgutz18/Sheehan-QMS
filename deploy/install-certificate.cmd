@echo off
rem installs the shop's certificate authority on this PC, so Edge and Chrome trust https://sheehanqms.local
rem (the authority is made by deploy/make-certs.sh on the server; see docs/DEPLOY-UBUNTU.md, Optional: HTTPS)
rem run it once on every Windows PC that opens the app (staff PCs, the display PC): double-click it, allow the
rem administrator prompt, then close every Edge and Chrome window and open them again
rem   - it downloads the authority from the server and installs it only if its fingerprint is FINGERPRINT below,
rem     so a look-alike handed out on the network is never trusted
rem   - it goes in the whole PC's Trusted Root Certification Authorities, for every Windows account on it
rem usage: install-certificate.cmd [server address]   e.g. install-certificate.cmd http://192.168.1.208

setlocal

rem the queue server; change it here if the server's address changes
set "SERVER=http://sheehanqms.local"
if not "%~1"=="" set "SERVER=%~1"
rem the authority's SHA-256 fingerprint; on the server:
rem   openssl x509 -in /etc/ssl/sheehan-queue/ca.crt -noout -fingerprint -sha256
rem (only changes if the authority is made again from scratch, which every device would then need again)
set "FINGERPRINT=46A032D55BC753B8128080F5F4962EEB89AEBE0A32AD3868C6D05FB0EFC56C62"
set "NAME=Sheehan QMS local certificate authority"
set "FILE=%TEMP%\sheehan-ca.crt"

rem the whole PC's certificates need an administrator: ask once, and start over as one
net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%SERVER%' -Verb RunAs -ErrorAction Stop" >nul 2>&1
    if errorlevel 1 (
        echo The administrator prompt was turned down, so nothing was installed.
        pause
    )
    exit /b
)

echo Downloading the certificate authority from %SERVER% ...
curl.exe -fsS -o "%FILE%" "%SERVER%/sheehan-ca.crt"
if errorlevel 1 (
    echo.
    echo Couldn't download %SERVER%/sheehan-ca.crt.
    echo Check that this PC is on the shop's network and the server is on, then run this again.
    pause
    exit /b 1
)

set "GOT="
for /f "usebackq delims=" %%h in (`powershell -NoProfile -Command "[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash((New-Object Security.Cryptography.X509Certificates.X509Certificate2('%FILE%')).RawData)) -replace '-',''"`) do set "GOT=%%h"
if /i not "%GOT%"=="%FINGERPRINT%" (
    echo.
    echo This isn't the shop's certificate authority, so it was NOT installed.
    echo   expected fingerprint: %FINGERPRINT%
    echo   downloaded:           %GOT%
    echo If the authority was made again on the server, put its new fingerprint in FINGERPRINT at the top of this file.
    del "%FILE%" >nul 2>&1
    pause
    exit /b 1
)

certutil -addstore -f Root "%FILE%" >nul
set "FAILED=%errorlevel%"
del "%FILE%" >nul 2>&1
certutil -store Root "%NAME%" >nul 2>&1
if errorlevel 1 set "FAILED=1"
if not "%FAILED%"=="0" (
    echo.
    echo Couldn't install the certificate authority. Run this again and allow the administrator prompt.
    pause
    exit /b 1
)

echo.
echo Done: this PC now trusts %NAME%.
echo Close every Edge and Chrome window (check the tray too), open the browser again and go to
echo %SERVER:http://=https://%
pause
