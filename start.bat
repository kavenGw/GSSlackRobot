@echo off
cd /d "%~dp0"
node --env-file .env scripts/update-sdk.mjs
npm run build && npm start
pause
