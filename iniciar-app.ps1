# Levanta la app (backend + frontend) pidiendo antes la clave fiscal de ARCA.
# La clave se escribe oculta, queda sólo en la memoria de esta ventana (variable ARCA_CLAVE) y no se
# guarda en ningún archivo ni en el historial de PowerShell. Al cerrar la ventana se pierde.
Set-Location $PSScriptRoot

$clave = Read-Host 'Clave fiscal de ARCA (no se ve mientras escribis; Enter para seguir sin clave)' -AsSecureString
$plana = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave))
if ($plana) {
  $env:ARCA_CLAVE = $plana
  Write-Host 'Clave cargada. Abri http://localhost:5182 cuando aparezca [WEB] listo.' -ForegroundColor Green
} else {
  Write-Host 'Sin clave: la carga automatica desde ARCA va a quedar deshabilitada.' -ForegroundColor Yellow
}

npm run dev
