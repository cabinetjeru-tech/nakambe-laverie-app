# Veritrace — installation pour l'utilisateur courant (Windows, sans droits administrateur).
# Copie veritrace.exe dans %LOCALAPPDATA%\Programs\Veritrace et l'ajoute au PATH de l'utilisateur.
$ErrorActionPreference = "Stop"
$src = Join-Path $PSScriptRoot "veritrace.exe"
if (-not (Test-Path $src)) { throw "veritrace.exe introuvable à côté de ce script." }
$dest = Join-Path $env:LOCALAPPDATA "Programs\Veritrace"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force $src $dest
Unblock-File -Path (Join-Path $dest "veritrace.exe") -ErrorAction SilentlyContinue
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not (($userPath -split ";") -contains $dest)) {
    [Environment]::SetEnvironmentVariable("Path", (($userPath.TrimEnd(";") + ";" + $dest).TrimStart(";")), "User")
    Write-Host "Dossier ajouté au PATH de l'utilisateur : $dest"
}
Write-Host ""
& (Join-Path $dest "veritrace.exe") --version
Write-Host ""
Write-Host "Installation terminée. Ouvrez un NOUVEAU terminal puis lancez :"
Write-Host "    veritrace selftest     (vérifie l'installation)"
Write-Host "    veritrace doctor       (outils externes : ADB, ALEAPP, MVT, Autopsy)"
