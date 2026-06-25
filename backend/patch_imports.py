import os

files = [
    "routers/transaksi.py",
    "routers/pengeluaran.py",
    "routers/pelanggan.py",
    "routers/laporan.py",
    "routers/kendaraan.py",
    "routers/karyawan.py"
]

for f in files:
    path = os.path.join(r"d:\KULIAH\Semester 6\Pengembangan Aplikasi\AeroRent\backend", f)
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()
    
    if "from utils import fmt_float, fmt_date" not in content:
        # Find a good place to insert (after import os or from typing import Optional etc)
        # Just insert at the top after the first line (from fastapi import APIRouter...)
        lines = content.split('\n')
        lines.insert(1, "from utils import fmt_float, fmt_date")
        
        with open(path, "w", encoding="utf-8") as file:
            file.write('\n'.join(lines))
        print(f"Patched {f}")
    else:
        print(f"Already patched {f}")
