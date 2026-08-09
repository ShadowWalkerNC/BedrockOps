# Production-shaped local start for Windows PowerShell.
# From repo root:  powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "[start-local] created .env from .env.example"
}

# Prefer prisma + no silent auto-login
(Get-Content .env) `
  -replace '^DB_ADAPTER=.*', 'DB_ADAPTER=prisma' `
  -replace '^NEXT_PUBLIC_DEV_AUTO_LOGIN=.*', 'NEXT_PUBLIC_DEV_AUTO_LOGIN=false' `
  | Set-Content .env

Write-Host "[start-local] starting Postgres (docker compose)..."
docker compose up -d postgres

Write-Host "[start-local] prisma generate + migrate..."
pnpm --filter @mc-admin/db db:generate
$env:DATABASE_URL = "postgresql://mcadmin:mcadmin_password@localhost:5432/minecraft_admin"
pnpm --filter @mc-admin/db db:migrate

Write-Host "[start-local] cleaning Next cache..."
pnpm --filter @mc-admin/web clean

Write-Host "[start-local] building Go agent..."
pnpm --filter @mc-admin/agent agent:build

New-Item -ItemType Directory -Force -Path "$env:TEMP\bedrockops-world\worlds" | Out-Null

Write-Host ""
Write-Host "Open THREE terminals and run:"
Write-Host "  1) `$env:PORT=4000; `$env:DB_ADAPTER='prisma'; pnpm --filter @mc-admin/api dev"
Write-Host "  2) `$env:NEXT_PUBLIC_DEV_AUTO_LOGIN='false'; `$env:API_URL='http://localhost:4000'; pnpm --filter @mc-admin/web dev"
Write-Host "  3) .\apps\agent\bin\bedrock-agent.exe -control-plane http://127.0.0.1:4000 -node-id node_docker_agent_1 -token dev_agent_token_change_me -server-path $env:TEMP\bedrockops-world"
Write-Host ""
Write-Host "Then open http://localhost:3000/login"
Write-Host "  admin@minecraft-admin.local / admin"
Write-Host ""
Write-Host "IMPORTANT: root .env has PORT=3000 for the web app — always override API with PORT=4000."
