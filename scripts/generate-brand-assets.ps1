# Generate mobile + frontend brand assets from mobile/assets/icon-192.png
Add-Type -AssemblyName System.Drawing

$repoRoot = Join-Path $PSScriptRoot '..' | Resolve-Path
$iconSource = Join-Path $repoRoot 'mobile\assets\icon-192.png'
$splashSource = $iconSource
$mobileAssets = Join-Path $repoRoot 'mobile\assets'
$publicDir = Join-Path $repoRoot 'frontend\public'
$mobileOnly = $args -contains '-MobileOnly'

if (-not (Test-Path $iconSource)) {
    Write-Error "Icon source not found: $iconSource"
    exit 1
}

function Save-SquareIcon {
    param(
        [System.Drawing.Image]$Img,
        [string]$DestPath,
        [int]$Size,
        [double]$ScaleFactor = 0.82
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $scale = [Math]::Min($Size / $Img.Width, $Size / $Img.Height) * $ScaleFactor
    $w = [int]($Img.Width * $scale)
    $h = [int]($Img.Height * $scale)
    $x = [int](($Size - $w) / 2)
    $y = [int](($Size - $h) / 2)
    $g.DrawImage($Img, $x, $y, $w, $h)
    $bmp.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
}

function Save-Splash {
    param(
        [System.Drawing.Image]$Img,
        [string]$DestPath,
        [int]$Width = 1284,
        [int]$Height = 2778
    )

    $bmp = New-Object System.Drawing.Bitmap $Width, $Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $target = [int]($Width * 0.42)
    $scale = [Math]::Min($target / $Img.Width, $target / $Img.Height)
    $w = [int]($Img.Width * $scale)
    $h = [int]($Img.Height * $scale)
    $x = [int](($Width - $w) / 2)
    $y = [int](($Height - $h) / 2)
    $g.DrawImage($Img, $x, $y, $w, $h)
    $bmp.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
}

$iconImg = [System.Drawing.Image]::FromFile($iconSource)

# Mobile (Expo) — icon + splash from icon-192 (white background)
Save-SquareIcon -Img $iconImg -DestPath (Join-Path $mobileAssets 'icon.png') -Size 1024
Save-SquareIcon -Img $iconImg -DestPath (Join-Path $mobileAssets 'adaptive-icon.png') -Size 1024
Save-SquareIcon -Img $iconImg -DestPath (Join-Path $mobileAssets 'favicon.png') -Size 48
Save-Splash -Img $iconImg -DestPath (Join-Path $mobileAssets 'splash.png')

if (-not $mobileOnly) {
    # Frontend PWA + UI
    Copy-Item -Path $iconSource -Destination (Join-Path $publicDir 'icon-192.png') -Force
    Save-SquareIcon -Img $iconImg -DestPath (Join-Path $publicDir 'icon-512.png') -Size 512
    Save-SquareIcon -Img $iconImg -DestPath (Join-Path $publicDir 'apple-touch-icon.png') -Size 180
    Save-SquareIcon -Img $iconImg -DestPath (Join-Path $publicDir 'logo.png') -Size 512
    Save-SquareIcon -Img $iconImg -DestPath (Join-Path $publicDir 'logo1.png') -Size 192
}

$iconImg.Dispose()

Write-Host "Brand assets generated"
Write-Host "  App icon source: icon-192.png"
Write-Host "  Splash source: icon-192.png"
Write-Host "  Mobile: icon.png, adaptive-icon.png, splash.png, favicon.png"
if (-not $mobileOnly) {
    Write-Host "  Frontend: icon-192.png, icon-512.png, apple-touch-icon.png, logo.png, logo1.png"
}
