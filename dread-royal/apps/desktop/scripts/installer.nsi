; Installateur Windows de DREAD ROYAL (NSIS) — installation par utilisateur, sans droits administrateur
Unicode true
!include "MUI2.nsh"
!define APPNAME "DREAD ROYAL"
!define EXE "DREAD ROYAL.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\DreadRoyal"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\DREAD ROYAL"
InstallDirRegKey HKCU "Software\DreadRoyal" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "DREAD ROYAL — Votre couronne, votre identité."
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1036 "ProductName" "DREAD ROYAL"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de DREAD ROYAL Management System"
VIAddVersionKey /LANG=1036 "CompanyName" "DREAD ROYAL"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "DREAD ROYAL"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Bienvenue dans l'installation de DREAD ROYAL"
!define MUI_WELCOMEPAGE_TEXT "DREAD ROYAL Management System — gestion du salon : rendez-vous, clients, caisse, factures, comptabilité, personnel, stock et fidélité.$\r$\n$\r$\nTout fonctionne sur cet ordinateur, sans Internet.$\r$\n$\r$\nFermez DREAD ROYAL s'il est ouvert, puis cliquez sur Suivant."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer DREAD ROYAL"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

Section "Installation"
  SetOutPath "$INSTDIR"
  ; Mise à jour : remplacer l'ancienne version (les données, dans C:\ProgramData\DreadRoyal, ne sont pas touchées)
  RMDir /r "$INSTDIR\resources"
  File /r "${SRCDIR}\*.*"
  WriteRegStr HKCU "Software\DreadRoyal" "InstallDir" "$INSTDIR"
  CreateShortcut "$DESKTOP\DREAD ROYAL.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateDirectory "$SMPROGRAMS\DREAD ROYAL"
  CreateShortcut "$SMPROGRAMS\DREAD ROYAL\DREAD ROYAL.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortcut "$SMPROGRAMS\DREAD ROYAL\Désinstaller DREAD ROYAL.lnk" "$INSTDIR\Desinstaller.exe"
  WriteUninstaller "$INSTDIR\Desinstaller.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "DREAD ROYAL Management System"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "DREAD ROYAL"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Desinstaller.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\DREAD ROYAL.lnk"
  RMDir /r "$SMPROGRAMS\DREAD ROYAL"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\DreadRoyal"
  MessageBox MB_ICONINFORMATION "DREAD ROYAL a été désinstallé.$\r$\n$\r$\nVos données (C:\ProgramData\DreadRoyal) et vos sauvegardes (Documents\DREAD ROYAL) ont été conservées."
SectionEnd
