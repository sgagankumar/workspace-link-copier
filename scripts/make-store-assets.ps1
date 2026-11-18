<#
  Dev-only: renders the Chrome Web Store images, logo files and the website's social preview
  from the HTML templates in store/src, using headless Chrome (or Edge).

  Usage:  powershell -ExecutionPolicy Bypass -File scripts\make-store-assets.ps1
#>
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'store\src'
$out = Join-Path $root 'store'

$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { throw 'Chrome or Edge not found.' }

$profileDir = Join-Path ([IO.Path]::GetTempPath()) 'wlc-store-render'

# template[#variant], output file, width, height, transparent background?
$jobs = @(
  @('screenshot-1-gmail.html',   'screenshot-1-gmail.png',      1280, 800, $false),
  @('screenshot-2-sheets.html',  'screenshot-2-sheets.png',     1280, 800, $false),
  @('screenshot-3-privacy.html', 'screenshot-3-privacy.png',    1280, 800, $false),
  @('promo-small.html',          'promo-small-440x280.png',      440, 280, $false),
  @('promo-marquee.html',        'promo-marquee-1400x560.png',  1400, 560, $false),
  @('promo-marquee.html#social', 'social-preview-1280x640.png', 1280, 640, $false),
  @('logo.html#mark',            'logo-512.png',                 512, 512, $true),
  @('logo.html#lockup',          'logo-lockup.png',             1200, 300, $true),
  @('logo.html#lockup-white',    'logo-lockup-white.png',       1200, 300, $true)
)

foreach ($job in $jobs) {
  $template, $file, $w, $h, $transparent = $job
  $page, $hash = $template -split '#', 2
  $url = ([Uri](Join-Path $src $page)).AbsoluteUri + $(if ($hash) { "#$hash" } else { '' })
  $target = Join-Path $out $file

  $chromeArgs = @(
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    "--user-data-dir=$profileDir", "--window-size=$w,$h", '--virtual-time-budget=3000',
    "--screenshot=$target"
  )
  if ($transparent) { $chromeArgs += '--default-background-color=00000000' }
  $chromeArgs += $url

  if (Test-Path $target) { Remove-Item $target }
  # Chrome logs progress to stderr; Windows PowerShell would treat that as a terminating error.
  $ErrorActionPreference = 'Continue'
  & $browser @chromeArgs 2>&1 | Out-Null
  $ErrorActionPreference = 'Stop'
  if (-not (Test-Path $target)) { throw "Failed to render $file" }
  Write-Output "Wrote store\$file ($w x $h)"
}

# The website uses the social preview as its Open Graph image.
Copy-Item (Join-Path $out 'social-preview-1280x640.png') (Join-Path $root 'docs\assets\social-preview.png') -Force
Write-Output 'Copied social preview to docs\assets\social-preview.png'
