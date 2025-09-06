# Canvas CLI Windows Installer Build Script
# Requires: WiX Toolset v3.11+, Node.js 20+

param(
    [string]$Version = "2.0.0",
    [string]$OutputDir = ".\output",
    [switch]$Sign = $false,
    [string]$CertPath = "",
    [string]$CertPassword = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Canvas CLI Windows Installer Builder v$Version" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js 20+" -ForegroundColor Red
    exit 1
}

# Check WiX Toolset
$wixPath = "${env:ProgramFiles(x86)}\WiX Toolset v3.11\bin"
if (-not (Test-Path "$wixPath\candle.exe")) {
    Write-Host "✗ WiX Toolset not found. Please install from https://wixtoolset.org" -ForegroundColor Red
    exit 1
}
Write-Host "✓ WiX Toolset found" -ForegroundColor Green

# Build Node.js application
Write-Host "`nBuilding Canvas CLI..." -ForegroundColor Yellow
Set-Location ..\..\
npm ci --production
npm run build

# Package with pkg
Write-Host "Creating executable..." -ForegroundColor Yellow
npx pkg . --targets node20-win-x64 --output dist/canvas.exe

# Create output directory
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Build MSI
Write-Host "`nBuilding MSI installer..." -ForegroundColor Yellow
Set-Location installers\windows

& "$wixPath\candle.exe" -dVersion=$Version canvas-cli.wxs -o "$OutputDir\canvas-cli.wixobj"
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to compile WiX source" -ForegroundColor Red
    exit 1
}

& "$wixPath\light.exe" -ext WixUIExtension -ext WixUtilExtension `
    "$OutputDir\canvas-cli.wixobj" -o "$OutputDir\canvas-cli-$Version-x64.msi"
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to link MSI" -ForegroundColor Red
    exit 1
}

# Sign the MSI if certificate provided
if ($Sign -and $CertPath) {
    Write-Host "Signing MSI..." -ForegroundColor Yellow
    $signTool = "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
    
    if (Test-Path $signTool) {
        & $signTool sign /f $CertPath /p $CertPassword /t http://timestamp.digicert.com `
            /d "Canvas CLI" /du "https://canvas-cli.com" "$OutputDir\canvas-cli-$Version-x64.msi"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ MSI signed successfully" -ForegroundColor Green
        } else {
            Write-Host "⚠ Failed to sign MSI" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠ SignTool not found, skipping signing" -ForegroundColor Yellow
    }
}

# Create portable ZIP
Write-Host "`nCreating portable ZIP..." -ForegroundColor Yellow
$zipPath = "$OutputDir\canvas-cli-$Version-win-x64-portable.zip"
Compress-Archive -Path ..\..\dist\*, ..\..\node_modules, ..\..\package.json, ..\..\README.md `
    -DestinationPath $zipPath -Force

# Generate checksums
Write-Host "`nGenerating checksums..." -ForegroundColor Yellow
$msiHash = Get-FileHash "$OutputDir\canvas-cli-$Version-x64.msi" -Algorithm SHA256
$zipHash = Get-FileHash $zipPath -Algorithm SHA256

@"
Canvas CLI $Version Windows Checksums
=====================================
MSI: $($msiHash.Hash)
ZIP: $($zipHash.Hash)
"@ | Out-File "$OutputDir\checksums.txt"

Write-Host "`n✓ Build complete!" -ForegroundColor Green
Write-Host "Outputs:" -ForegroundColor Cyan
Write-Host "  - MSI: $OutputDir\canvas-cli-$Version-x64.msi" -ForegroundColor White
Write-Host "  - ZIP: $OutputDir\canvas-cli-$Version-win-x64-portable.zip" -ForegroundColor White
Write-Host "  - Checksums: $OutputDir\checksums.txt" -ForegroundColor White