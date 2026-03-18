# ============================================================
# backup_and_push.ps1
# Genera un respaldo de la base de datos y lo sube a GitHub.
# Ejecutar desde la raiz del proyecto: powershell -ExecutionPolicy Bypass -File .\backup_and_push.ps1
# ============================================================

Write-Host "--- Iniciando respaldo de VisitaDoctores ---" -ForegroundColor Cyan

# 1. Llamar al endpoint del servidor para generar el backup_auto.sql
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/backup/github" -Method POST
    Write-Host "Respaldo generado en el servidor: $($response.message)" -ForegroundColor Green
    Write-Host "Registros exportados: $($response.rows)" -ForegroundColor Gray
} catch {
    Write-Host "Error al llamar al servidor: $_" -ForegroundColor Red
    exit 1
}

# 2. Traer el archivo desde el contenedor de Docker al host
Write-Host "Sincronizando archivo desde el contenedor..." -ForegroundColor Cyan
try {
    docker cp visitadoctores-app:/app/backup_auto.sql ./backup_auto.sql
    if ($LASTEXITCODE -ne 0) { throw "Error al copiar el archivo" }
    Write-Host "Archivo guardado localmente como backup_auto.sql" -ForegroundColor Green
} catch {
    Write-Host "Error al copiar el archivo desde Docker: $_" -ForegroundColor Red
    exit 1
}

# 3. Agregar el archivo al repositorio de git y hacer push
Write-Host "Subiendo a GitHub..." -ForegroundColor Cyan
$date = Get-Date -Format "yyyy-MM-dd HH:mm"
git add backup_auto.sql
git commit -m "backup: respaldo automatico $date"
git push origin master

if ($LASTEXITCODE -eq 0) {
    Write-Host "Respaldo subido a GitHub exitosamente." -ForegroundColor Green
    Write-Host ""
    Write-Host "En tu otra computadora ejecuta:" -ForegroundColor Yellow
    Write-Host "git pull origin master" -ForegroundColor White
    Write-Host "Luego restaura con: Get-Content backup_auto.sql | docker exec -i visitadoctores-db psql -U visitadoc_user -d visitadoctores" -ForegroundColor White
} else {
    Write-Host "No se pudo subir a GitHub. Verifica tu conexion y credenciales de Git." -ForegroundColor Yellow
}
