; ====================================================================
; ZEVA CBT — WINDOWS INSTALLER SCRIPT (NSIS)
; Zeus Technologies Innovations
;
; Compile with NSIS (https://nsis.sourceforge.io) to produce a real,
; double-click Windows installer: ZevaCBT-Setup-v1.7.exe
;
; See INSTALL-GUIDE.txt Part 2 for step-by-step build instructions.
; ====================================================================

!define PRODUCT_NAME "Zeva CBT"
!define PRODUCT_VERSION "1.7.0"
!define PRODUCT_PUBLISHER "Zeus Technologies Innovations"
!define PRODUCT_WEB_SITE "https://www.zeva-cbt.example"

; ---- Toggle this to 1 if node:sqlite did not survive `pkg` packaging
; (see INSTALL-GUIDE.txt "FALLBACK: IF node:sqlite DOESN'T SURVIVE
; PACKAGING", Option A). When 1, the installer bundles a portable
; Node.js runtime instead of the single pkg-built .exe, and the
; shortcuts run "node.exe server\server.js" instead of the .exe
; directly. Requires a portable Node build placed in bundled-node/
; before compiling (see the comment further down).
!define USE_BUNDLED_NODE 0

; ---- Basic installer metadata ----
Name "${PRODUCT_NAME}"
OutFile "ZevaCBT-Setup-v${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\Zeva CBT"
InstallDirRegKey HKLM "Software\ZevaCBT" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

; ---- Branding ----
!define MUI_ICON "zeva-icon.ico"
!define MUI_UNICON "zeva-icon.ico"
!define MUI_HEADERIMAGE
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome-banner.bmp" ; optional — see note below
!define MUI_ABORTWARNING

!include "MUI2.nsh"

; ---- Pages ----
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE-README.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\ZevaCBT.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Zeva CBT now"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ====================================================================
; MAIN INSTALL SECTION
; ====================================================================
Section "Zeva CBT Server" SEC01
  SetOutPath "$INSTDIR"

!if ${USE_BUNDLED_NODE} == 1
  ; Fallback mode: ship a portable Node.js runtime + the raw app
  ; source, and launch via node.exe. Download the "Windows Binary
  ; (.zip)" from https://nodejs.org for your target architecture,
  ; extract it, and place its contents in an "bundled-node" folder
  ; next to this script before compiling.
  File /r "..\*.*"
  File /r "bundled-node"
  ; Launcher batch file — this is what the shortcuts point at.
  FileOpen $0 "$INSTDIR\ZevaCBT.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'cd /d "%~dp0"$\r$\n'
  FileWrite $0 'start "" "%~dp0bundled-node\node.exe" "%~dp0server\server.js"$\r$\n'
  FileWrite $0 'timeout /t 2 >nul$\r$\n'
  FileWrite $0 'start "" http://localhost:8080$\r$\n'
  FileClose $0
!else
  ; Standard mode: the single packaged executable from `npm run build:win`.
  File "..\dist\ZevaCBTServer.exe"
  ; Launcher batch file — starts the server minimised and opens the
  ; browser to it, so the admin never has to look at a console window.
  FileOpen $0 "$INSTDIR\ZevaCBT.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'cd /d "%~dp0"$\r$\n'
  FileWrite $0 'start "" /min "%~dp0ZevaCBTServer.exe"$\r$\n'
  FileWrite $0 'timeout /t 2 >nul$\r$\n'
  FileWrite $0 'start "" http://localhost:8080$\r$\n'
  FileClose $0
!endif

  File "zeva-icon.ico"

  ; ---- Shortcuts ----
  CreateDirectory "$SMPROGRAMS\Zeva CBT"
  CreateShortCut "$SMPROGRAMS\Zeva CBT\Zeva CBT.lnk" "$INSTDIR\ZevaCBT.bat" "" "$INSTDIR\zeva-icon.ico"
  CreateShortCut "$SMPROGRAMS\Zeva CBT\Uninstall Zeva CBT.lnk" "$INSTDIR\uninstall.exe"
  CreateShortCut "$DESKTOP\Zeva CBT.lnk" "$INSTDIR\ZevaCBT.bat" "" "$INSTDIR\zeva-icon.ico"

  ; ---- Registry: install location + Add/Remove Programs entry ----
  WriteRegStr HKLM "Software\ZevaCBT" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZevaCBT" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZevaCBT" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZevaCBT" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZevaCBT" "DisplayIcon" "$INSTDIR\zeva-icon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZevaCBT" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZevaCBT" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZevaCBT" "NoRepair" 1

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

; ====================================================================
; UNINSTALL SECTION
; This is what makes a genuine uninstall remove server/license.json
; along with everything else — which is what makes a subsequent
; reinstall correctly generate a brand-new serial number (see
; licensing/license.js and INSTALL-GUIDE.txt Part 2's note on this).
; ====================================================================
Section "Uninstall"
  Delete "$INSTDIR\ZevaCBTServer.exe"
  Delete "$INSTDIR\ZevaCBT.bat"
  Delete "$INSTDIR\zeva-icon.ico"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR\server"       ; includes server\license.json and the exam database
  RMDir /r "$INSTDIR\licensing"
  RMDir /r "$INSTDIR\bundled-node" ; harmless no-op if USE_BUNDLED_NODE was 0
  RMDir /r "$INSTDIR"

  Delete "$SMPROGRAMS\Zeva CBT\Zeva CBT.lnk"
  Delete "$SMPROGRAMS\Zeva CBT\Uninstall Zeva CBT.lnk"
  RMDir "$SMPROGRAMS\Zeva CBT"
  Delete "$DESKTOP\Zeva CBT.lnk"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZevaCBT"
  DeleteRegKey HKLM "Software\ZevaCBT"
SectionEnd

; ====================================================================
; NOTES
; ====================================================================
; - zeva-icon.ico: convert assets/logo-icon.png to .ico (any free
;   online converter) and place it in this installer/ folder before
;   compiling. This is what makes the installer, shortcuts, and
;   Add/Remove Programs entry show your real logo instead of a
;   generic Windows icon — this is the main thing that makes the
;   install experience "look real and authentic."
;
; - welcome-banner.bmp (optional): a 164x314px BMP shown on the
;   installer's welcome/finish pages. Skip this line (remove the
;   MUI_WELCOMEFINISHPAGE_BITMAP define above) if you don't want a
;   custom banner — NSIS will use a plain default instead, which is
;   still a completely normal-looking installer either way.
;
; - LICENSE-README.txt: a short text file with your terms/usage
;   notice, shown as the installer's license/agreement page. A
;   template is included alongside this script.
