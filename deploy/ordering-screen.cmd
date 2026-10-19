@echo off
rem opens the ordering page (where customers pick a purpose and get a queue number) full screen in its own
rem Microsoft Edge window (Chrome when Edge isn't installed), for the kiosk PCs customers order at:
rem   - kiosk mode: no address bar or tabs, and F11 doesn't leave full screen, so customers stay on the
rem     ordering page; Alt+F4 closes it
rem   - pinch zoom and swipe-to-go-back are off, so a touch screen can't zoom the page or leave it
rem   - it has its own profile (%LOCALAPPDATA%\SheehanKiosk-Edge), so these settings apply even while the
rem     browser is already open for other things
rem receipts print through the print service, so start that too on a kiosk with a printer:
rem   python src\printing\script\printService.py --origin [server address]
rem double-click it, or put a shortcut to it in shell:startup to open the ordering page when Windows starts
rem usage: ordering-screen.cmd [server address]   e.g. ordering-screen.cmd http://192.168.1.50:3000

setlocal

rem the queue server, as kiosks and counters open it; change it here if the server's address changes
set "SERVER=http://172.17.87.62:3000"
if not "%~1"=="" set "SERVER=%~1"

set "BROWSER="
set "PROFILE=%LocalAppData%\SheehanKiosk-Edge"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER set "PROFILE=%LocalAppData%\SheehanKiosk-Chrome"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER (
    echo Neither Edge nor Chrome is installed on this PC.
    pause
    exit /b 1
)

rem --edge-kiosk-type is Edge's own; Chrome ignores it
start "" "%BROWSER%" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check ^
    --disable-pinch --overscroll-history-navigation=0 ^
    --kiosk "%SERVER%/" --edge-kiosk-type=fullscreen
