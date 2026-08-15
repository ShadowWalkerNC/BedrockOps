@echo off
setlocal enabledelayedexpansion

echo ========================================================================
echo               ⚡ BedrockOps 1-Click Local Launcher ⚡
echo ========================================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js (v18+) from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [*] Installing pnpm package manager...
    call npm install -g pnpm
)

:: Install dependencies if node_modules is missing
if not exist "node_modules" (
    echo [*] Installing project dependencies...
    call pnpm install
)

echo.
echo [*] Starting BedrockOps Control Plane API (Port 4000)...
echo [*] Starting BedrockOps Web Dashboard (Port 3000)...
echo.

:: Open default browser after 3 seconds in the background
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start the stack
call pnpm dev
