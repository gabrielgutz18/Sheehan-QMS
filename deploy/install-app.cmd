@echo off
rem puts a "Sheehan QMS" icon on this PC's desktop and in its Start menu, which opens the staff pages in their own
rem Microsoft Edge window (Chrome when Edge isn't installed), with no address bar or tabs, like any program
rem   - for staff PCs; the display PC has deploy\display-screen.cmd instead
rem   - works over plain http, so it needs nothing else on the PC; over https (docs/DEPLOY-UBUNTU.md, Optional:
rem     HTTPS) the app can also be installed from its own Install app button, at the foot of the sidebar
rem   - only for the Windows account that runs it; no administrator needed
rem double-click it once on each PC, or get it from http://<server>/install-app.cmd
rem usage: install-app.cmd [server address]   e.g. install-app.cmd http://192.168.1.208:3000

setlocal

rem the queue server, as the staff open it; change it here if the server's address changes
set "SERVER=http://sheehanqms.local"
if not "%~1"=="" set "SERVER=%~1"

set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER (
    echo Neither Edge nor Chrome is installed on this PC.
    pause
    exit /b 1
)

rem the Sheehan logo for the icon, from the server; the browser's own icon if it can't be reached
set "HOME_DIR=%LocalAppData%\SheehanQMS"
set "ICON=%HOME_DIR%\sheehan.ico"
if not exist "%HOME_DIR%" mkdir "%HOME_DIR%"
curl.exe -fsS -o "%ICON%" "%SERVER%/favicon.ico" >nul 2>&1
if errorlevel 1 (
    echo Couldn't reach %SERVER% for the icon, so the shortcut has the browser's icon.
    echo Check the server address at the top of this file if the app doesn't open either.
    set "ICON=%BROWSER%"
)

rem the desktop and Start menu folders from Windows itself, since OneDrive can move the desktop
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$shell = New-Object -ComObject WScript.Shell;" ^
    "foreach ($folder in [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) {" ^
    "  $link = $shell.CreateShortcut((Join-Path $folder 'Sheehan QMS.lnk'));" ^
    "  $link.TargetPath = $env:BROWSER;" ^
    "  $link.Arguments = '--app=' + $env:SERVER + '/staff';" ^
    "  $link.IconLocation = $env:ICON;" ^
    "  $link.Description = 'Sheehan, Inc. ordering and queue system';" ^
    "  $link.Save() }"
if errorlevel 1 (
    echo Couldn't make the shortcut.
    pause
    exit /b 1
)

echo Done: "Sheehan QMS" is on the desktop and in the Start menu.
echo It opens %SERVER%/staff in its own window. Right-click it in the taskbar to pin it there.
start "" "%BROWSER%" --app="%SERVER%/staff"
pause
