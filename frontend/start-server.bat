@echo off
REM Jalankan server lokal untuk AeroRent Frontend.
REM Pakai: dobel-klik file ini, atau jalankan dari Terminal: start-server.bat
set PORT=8000
echo Menjalankan server di http://localhost:%PORT%
echo Buka http://localhost:%PORT%/login.html di browser. Tekan Ctrl+C untuk berhenti.
python -m http.server %PORT%
pause
