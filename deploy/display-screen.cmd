@echo off
rem opens the queue display full screen in its own Microsoft Edge window (Chrome when Edge isn't installed),
rem for the PC that drives the display screen:
rem   - Edge has Microsoft's natural voices (Ava, Emma, Jenny, Aria, Michelle, Rosa for Philippine English, ...);
rem     pick one under Admin -> Call announcements with the admin page open in Edge, so the display has it too
rem   - sound is allowed from the start, so calls are read out without anyone clicking the page first
rem     (browsers otherwise keep sound off after every start or reload until someone clicks)
rem   - it keeps polling and announcing while the window is covered or minimized
rem   - it has its own profile (%LOCALAPPDATA%\SheehanDisplay-Edge), so these settings apply even while the
rem     browser is already open for other things; F11 leaves full screen, Alt+F4 closes it
rem double-click it, or put a shortcut to it in shell:startup to open the display when Windows starts
rem usage: display-screen.cmd [server address]   e.g. display-screen.cmd http://192.168.1.50:3000

setlocal

rem the queue server, as the display and counters open it; change it here if the server's address changes
set "SERVER=http://192.168.1.208:3000"
if not "%~1"=="" set "SERVER=%~1"

set "BROWSER="
set "PROFILE=%LocalAppData%\SheehanDisplay-Edge"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER set "PROFILE=%LocalAppData%\SheehanDisplay-Chrome"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER (
    echo Neither Edge nor Chrome is installed on this PC.
    pause
    exit /b 1
)

start "" "%BROWSER%" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check ^
    --autoplay-policy=no-user-gesture-required ^
    --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding ^
    --start-fullscreen --app="%SERVER%/"
