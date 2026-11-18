<#
  Dev-only: renders the toolbar icons (icons/icon16|32|48|128.png) from the same design as
  icons/icon.svg — a white Material "share" glyph on a #1a73e8 circle — using System.Drawing.
  Windows PowerShell 5.1+ (no Node or npm needed).

  Usage:  powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
#>
param([int[]]$Sizes = @(16, 32, 48, 128))

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Material Icons "share" (Apache License 2.0), 24x24 grid.
$SharePath = 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z'

$Inv = [Globalization.CultureInfo]::InvariantCulture

# Minimal SVG path parser for the commands this glyph uses: M L C S Z (absolute and relative).
function New-GlyphPath([string]$d) {
  $tokens = @([regex]::Matches($d, '[MmLlCcSsZz]|[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?') | ForEach-Object { $_.Value })
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath ([System.Drawing.Drawing2D.FillMode]::Winding)
  $i = 0; $cmd = ''
  $x = 0.0; $y = 0.0; $startX = 0.0; $startY = 0.0
  $lastC2x = 0.0; $lastC2y = 0.0; $prevCubic = $false

  while ($i -lt $tokens.Count) {
    $t = $tokens[$i]
    if ($t -cmatch '^[A-Za-z]$') {
      $cmd = $t; $i++
      if ($cmd -eq 'Z') { $gp.CloseFigure(); $x = $startX; $y = $startY; $prevCubic = $false }
      continue
    }
    $n = @()
    for ($k = 0; $k -lt 6 -and ($i + $k) -lt $tokens.Count; $k++) {
      $tok = $tokens[$i + $k]
      if ($tok -cmatch '^[A-Za-z]$') { break }
      $n += [double]::Parse($tok, $Inv)
    }
    $rel = $cmd -cmatch '^[a-z]$'
    $ox = if ($rel) { $x } else { 0.0 }
    $oy = if ($rel) { $y } else { 0.0 }

    switch ($cmd.ToUpperInvariant()) {
      'M' {
        $x = $ox + $n[0]; $y = $oy + $n[1]; $i += 2
        $gp.StartFigure(); $startX = $x; $startY = $y; $prevCubic = $false
        $cmd = if ($rel) { 'l' } else { 'L' }   # implicit lineto after moveto
      }
      'L' {
        $nx = $ox + $n[0]; $ny = $oy + $n[1]; $i += 2
        $gp.AddLine([single]$x, [single]$y, [single]$nx, [single]$ny)
        $x = $nx; $y = $ny; $prevCubic = $false
      }
      'C' {
        $x1 = $ox + $n[0]; $y1 = $oy + $n[1]; $x2 = $ox + $n[2]; $y2 = $oy + $n[3]
        $nx = $ox + $n[4]; $ny = $oy + $n[5]; $i += 6
        $gp.AddBezier([single]$x, [single]$y, [single]$x1, [single]$y1, [single]$x2, [single]$y2, [single]$nx, [single]$ny)
        $lastC2x = $x2; $lastC2y = $y2; $x = $nx; $y = $ny; $prevCubic = $true
      }
      'S' {
        if ($prevCubic) { $x1 = 2 * $x - $lastC2x; $y1 = 2 * $y - $lastC2y } else { $x1 = $x; $y1 = $y }
        $x2 = $ox + $n[0]; $y2 = $oy + $n[1]; $nx = $ox + $n[2]; $ny = $oy + $n[3]; $i += 4
        $gp.AddBezier([single]$x, [single]$y, [single]$x1, [single]$y1, [single]$x2, [single]$y2, [single]$nx, [single]$ny)
        $lastC2x = $x2; $lastC2y = $y2; $x = $nx; $y = $ny; $prevCubic = $true
      }
      default { throw "Unsupported path command '$cmd'" }
    }
  }
  return $gp
}

$outDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'icons'
$glyph = New-GlyphPath $SharePath
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#1a73e8'))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

foreach ($size in $Sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Same geometry as icon.svg: 128-unit canvas, glyph at translate(28 28) scale(3).
    # The 128px icon is shown in the Chrome Web Store and on chrome://extensions, where Google's
    # guidelines ask for transparent padding around the artwork: draw it 112px wide, centred.
    $artwork = if ($size -ge 128) { $size * 112.0 / 128.0 } else { [double]$size }
    $inset = ($size - $artwork) / 2
    $g.TranslateTransform($inset, $inset)
    $g.ScaleTransform($artwork / 128.0, $artwork / 128.0)
    $g.FillEllipse($blue, 0, 0, 128, 128)
    $g.TranslateTransform(28, 28)
    $g.ScaleTransform(3, 3)
    $g.FillPath($white, $glyph)

    $file = Join-Path $outDir "icon$size.png"
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Wrote $file"
  } finally {
    $g.Dispose(); $bmp.Dispose()
  }
}

$glyph.Dispose(); $blue.Dispose(); $white.Dispose()
