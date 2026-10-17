$ErrorActionPreference = "Stop"
$python = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  $python = (Get-Command python -ErrorAction Stop).Source
}

$env:HOST = "127.0.0.1"
$env:PORT = "8000"
$env:ALLOWED_ORIGINS = "http://127.0.0.1:5500"
$env:DINNER_DECIDER_DB = Join-Path $PSScriptRoot "data\dinner-decider.sqlite3"

Write-Host "Dinner Decider SQLite API will listen on http://localhost:8000/"
Write-Host "Database file: $env:DINNER_DECIDER_DB"
Write-Host "Press Ctrl+C to stop the API."
& $python (Join-Path $PSScriptRoot "server.py")
