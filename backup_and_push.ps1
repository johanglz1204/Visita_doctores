# ============================================================
# backup_and_push.ps1
# Genera un respaldo de la base de datos y lo sube a GitHub.
# Ejecutar desde la raiz del proyecto: .\backup_and_push.ps1
# ============================================================

Write-Host "💾 Iniciando respaldo de VisitaDoctores..." -ForegroundColor Cyan

# 1. Llamar al endpoint del servidor para generar el backup_auto.sql
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/backup/github" -Method POST
    Write-Host "✅ Respaldo generado: $($response.message)" -ForegroundColor Green
    Write-Host "   Registros exportados: $($response.rows)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error al generar respaldo: $_" -ForegroundColor Red
    exit 1
}

# 2. Verificar que el archivo de respaldo existe
$backupFile = "backup_auto.sql"
if (-Not (Test-Path $backupFile)) {
    Write-Host "❌ No se encontró el archivo de respaldo: $backupFile" -ForegroundColor Red
    exit 1
}

# 3. Agregar el archivo al repositorio de git y hacer push
$date = Get-Date -Format "yyyy-MM-dd HH:mm"
git add $backupFile
git commit -m "backup: respaldo automático $date"
git push origin master

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Respaldo subido a GitHub exitosamente." -ForegroundColor Green
    Write-Host ""
    Write-Host "📌 En tu otra computadora ejecuta:" -ForegroundColor Yellow
    Write-Host "   git pull origin master" -ForegroundColor White
    Write-Host "   luego restaura con: Get-Content backup_auto.sql | docker exec -i visitadoctores-db psql -U visitadoc_user -d visitadoctores" -ForegroundColor White
} else {
    Write-Host "⚠️  No se pudo subir a GitHub. Verifica tu conexión y credenciales de Git." -ForegroundColor Yellow
}
