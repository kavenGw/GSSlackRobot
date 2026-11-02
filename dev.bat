@echo off
cd /d "%~dp0"
set DEBUG_CLAUDE=true
node --env-file .env scripts/update-sdk.mjs
npm run dev
pause
