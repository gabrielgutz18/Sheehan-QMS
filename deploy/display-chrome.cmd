@echo off
rem opens the queue display full screen in its own Chrome window, for the PC that drives the display screen:
rem   - sound is allowed from the start, so calls are read out without anyone clicking the page first
rem     (browsers otherwise keep sound off after every start or reload until someone clicks)
rem   - it keeps polling and announcing while the window is covered or minimized
rem   - it has its own profile (%LOCALAPPDATA%\SheehanDisplay), so these settings apply even while Chrome is
rem     already open for other things; F11 leaves full screen, Alt+F4 closes it
rem double-click it, or put a shortcut to it in shell:startup to open the display when Windows starts
rem usage: display-chrome.cmd [server address]   e.g. display-chrome.cmd http://192.168.1.50:3000

setlocal

rem the queue server, as kiosks and counters open it; change it here if the server's address changes
set "SERVER=http://172.17.87.62:3000"
if not "%~1"=="" set "SERVER=%~1"

rem Chrome, or Edge when Chrome isn't installed
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER (
    echo Neither Chrome nor Edge is installed on this PC.
    pause
    exit /b 1
)

start "" "%BROWSER%" --user-data-dir="%LocalAppData%\SheehanDisplay" --no-first-run --no-default-browser-check ^
    --autoplay-policy=no-user-gesture-required ^
    --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding ^
    --start-fullscreen --app="%SERVER%/queue"
