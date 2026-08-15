#!/usr/bin/env bash
set -e

echo "========================================================================"
echo "              ⚡ BedrockOps 1-Click Local Launcher ⚡"
echo "========================================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js (v18+) from: https://nodejs.org/"
    exit 1
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "[*] Installing pnpm package manager..."
    npm install -g pnpm
fi

# Install dependencies if node_modules missing
if [ ! -d "node_modules" ]; then
    echo "[*] Installing project dependencies..."
    pnpm install
fi

echo ""
echo "[*] Starting BedrockOps Control Plane API (Port 4000)..."
echo "[*] Starting BedrockOps Web Dashboard (Port 3000)..."
echo ""

# Open browser in background
if command -v xdg-open &> /dev/null; then
    (sleep 3 && xdg-open http://localhost:3000) &
elif command -v open &> /dev/null; then
    (sleep 3 && open http://localhost:3000) &
fi

# Start the stack
pnpm dev
