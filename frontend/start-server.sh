#!/bin/bash
# Jalankan server lokal untuk AeroRent Frontend.
# Pakai dari Terminal: ./start-server.sh
PORT=8000
echo "Menjalankan server di http://localhost:$PORT"
echo "Buka http://localhost:$PORT/login.html di browser. Tekan Ctrl+C untuk berhenti."
python3 -m http.server $PORT 2>/dev/null || python -m http.server $PORT
