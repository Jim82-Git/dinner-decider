$ErrorActionPreference = "Stop"
$root = (Resolve-Path $PSScriptRoot).Path
$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:5500/")

$contentTypes = @{
  ".css" = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg" = "image/svg+xml"
}

$listener.Start()
Write-Host "Dinner Decider is available at http://127.0.0.1:5500/"
Write-Host "Press Ctrl+C to stop the local web server."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      if ($context.Request.HttpMethod -notin @("GET", "HEAD")) {
        $context.Response.StatusCode = 405
        $context.Response.Close()
        continue
      }

      $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
      if ([string]::IsNullOrEmpty($relativePath)) {
        $relativePath = "index.html"
      }

      if ($relativePath -eq "config.js") {
        $context.Response.ContentType = "text/javascript; charset=utf-8"
        $bytes = [Text.Encoding]::UTF8.GetBytes(
          'window.DINNER_DECIDER_CONFIG = Object.freeze({ apiBaseUrl: "http://localhost:8000" });'
        )
      } else {
        $filePath = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $relativePath))
        if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
          $context.Response.StatusCode = 404
          $context.Response.Close()
          continue
        }
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
          $context.Response.StatusCode = 404
          $context.Response.Close()
          continue
        }

        $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
        if ($contentTypes.ContainsKey($extension)) {
          $context.Response.ContentType = $contentTypes[$extension]
        } else {
          $context.Response.ContentType = "application/octet-stream"
        }
        $bytes = [IO.File]::ReadAllBytes($filePath)
      }

      $context.Response.ContentLength64 = $bytes.Length
      if ($context.Request.HttpMethod -eq "GET") {
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      $context.Response.Close()
    } catch {
      Write-Warning "Request failed: $($_.Exception.Message)"
      try {
        $context.Response.StatusCode = 500
        $context.Response.Close()
      } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
