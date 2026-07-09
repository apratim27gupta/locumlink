Add-Type -AssemblyName System.Drawing

function New-PwaIcon {
    param(
        [string]$SourcePath,
        [string]$DestPath,
        [int]$Size
    )

    $img = [System.Drawing.Image]::FromFile($SourcePath)
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $scale = [Math]::Min($Size / $img.Width, $Size / $img.Height) * 0.82
    $w = [int]($img.Width * $scale)
    $h = [int]($img.Height * $scale)
    $x = [int](($Size - $w) / 2)
    $y = [int](($Size - $h) / 2)
    $g.DrawImage($img, $x, $y, $w, $h)
    $bmp.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
}

$repoRoot = Join-Path $PSScriptRoot '..' | Resolve-Path
$publicDir = Join-Path $repoRoot 'frontend\public'
$source = Join-Path $repoRoot 'mobile\assets\icon-192.png'

New-PwaIcon -SourcePath $source -DestPath (Join-Path $publicDir 'apple-touch-icon.png') -Size 180
New-PwaIcon -SourcePath $source -DestPath (Join-Path $publicDir 'icon-192.png') -Size 192
New-PwaIcon -SourcePath $source -DestPath (Join-Path $publicDir 'icon-512.png') -Size 512

Write-Host "Generated PWA icons in $publicDir"
