@echo off
cd /d "%~dp0"
npm run build && npm start
pause
