from fastapi import APIRouter, Depends, HTTPException
from utils import fmt_float, fmt_date
from typing import Optional
import aiomysql
from datetime import date
from database import get_db
from dependencies import req_kasir_or_owner, req_owner
from config import log

router = APIRouter(prefix="/laporan", tags=["Laporan"])
@router.get("/keuangan", tags=["📊 Laporan"])
async def laporan_keuangan(
    dari:   Optional[date] = None,
    sampai: Optional[date] = None,
    user=Depends(req_owner),
    cur=Depends(get_db),
):
    try:
        if not dari:   dari   = date.today().replace(day=1)
        if not sampai: sampai = date.today()
        p = {"d": dari, "s": sampai}

        await cur.execute(
            "SELECT COALESCE(SUM(total_biaya),0) AS total, COUNT(*) AS jml FROM TRANSAKSI_SEWA "
            "WHERE status = 'SELESAI' AND tanggal_mulai BETWEEN %(d)s AND %(s)s", p
        )
        pend_row = await cur.fetchone()

        await cur.execute(
            "SELECT COALESCE(SUM(jumlah),0) AS total FROM PENGELUARAN_OPERASIONAL "
            "WHERE tanggal_pengeluaran BETWEEN %(d)s AND %(s)s", p
        )
        peng_row = await cur.fetchone()

        await cur.execute(
            "SELECT kategori, COALESCE(SUM(jumlah),0) AS total FROM PENGELUARAN_OPERASIONAL "
            "WHERE tanggal_pengeluaran BETWEEN %(d)s AND %(s)s "
            "GROUP BY kategori ORDER BY total DESC", p
        )
        dist_peng = {r["kategori"]: fmt_float(r["total"]) for r in await cur.fetchall()}

        await cur.execute(
            "SELECT DATE_FORMAT(tanggal_mulai,'%%Y-%%m') AS bulan, SUM(total_biaya) AS pend "
            "FROM TRANSAKSI_SEWA WHERE status = 'SELESAI' "
            "AND tanggal_mulai BETWEEN DATE_SUB(%(s)s, INTERVAL 11 MONTH) AND %(s)s "
            "GROUP BY DATE_FORMAT(tanggal_mulai,'%%Y-%%m') ORDER BY bulan", p
        )
        tren = [{"bulan": r["bulan"], "pendapatan": float(r["pend"] or 0)} for r in await cur.fetchall()]

        await cur.execute(
            "SELECT k.nama_kendaraan, SUM(ts.total_biaya) AS total, COUNT(*) AS jml "
            "FROM TRANSAKSI_SEWA ts JOIN KENDARAAN k ON ts.id_kendaraan = k.id_kendaraan "
            "WHERE ts.status = 'SELESAI' AND ts.tanggal_mulai BETWEEN %(d)s AND %(s)s "
            "GROUP BY k.nama_kendaraan ORDER BY total DESC LIMIT 5", p
        )
        top_kend = [{"nama": r["nama_kendaraan"], "total": float(r["total"] or 0), "jumlah_sewa": r["jml"]} for r in await cur.fetchall()]

        await cur.execute(
            "SELECT status, COUNT(*) AS jml FROM TRANSAKSI_SEWA "
            "WHERE tanggal_mulai BETWEEN %(d)s AND %(s)s GROUP BY status", p
        )
        dist_status = {r["status"]: r["jml"] for r in await cur.fetchall()}

        tp, tpe = float(pend_row["total"] or 0), float(peng_row["total"] or 0)
        return {
            "periode": {"dari": dari.isoformat(), "sampai": sampai.isoformat()},
            "ringkasan": {
                "total_pendapatan_kotor":  tp,
                "total_biaya_operasional": tpe,
                "profit_bersih":           tp - tpe,
                "margin_persen":           round((tp - tpe) / tp * 100, 2) if tp > 0 else 0,
                "jumlah_transaksi_selesai": int(pend_row["jml"]),
            },
            "tren_bulanan":                tren,
            "distribusi_status":           dist_status,
            "distribusi_pengeluaran":      dist_peng,
            "top_5_kendaraan":             top_kend,
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Laporan] Gagal memuat laporan keuangan: {e}")
        raise HTTPException(500, "Gagal memuat laporan keuangan.")

@router.get("/armada", tags=["📊 Laporan"])
async def laporan_armada(user=Depends(req_owner), cur=Depends(get_db)):
    """Statistik performa & utilisasi armada bulan berjalan."""
    try:
        await cur.execute("SELECT status, COUNT(*) AS total FROM KENDARAAN GROUP BY status")
        status_armada = {r["status"]: r["total"] for r in await cur.fetchall()}

        await cur.execute(
            "SELECT k.id_kendaraan AS id, k.nama_kendaraan AS nama, k.tipe_kendaraan AS tipe, k.status, "
            "k.foto_url AS foto, k.harga_sewa_harian AS harga_harian, "
            "COUNT(ts.id_transaksi) AS sewa_bulan_ini, COALESCE(SUM(ts.total_biaya),0) AS pendapatan_bulan_ini "
            "FROM KENDARAAN k "
            "LEFT JOIN TRANSAKSI_SEWA ts ON k.id_kendaraan = ts.id_kendaraan "
            "AND ts.status = 'SELESAI' AND DATE_FORMAT(ts.tanggal_mulai, '%%Y-%%m') = DATE_FORMAT(CURRENT_DATE, '%%Y-%%m') "
            "GROUP BY k.id_kendaraan, k.nama_kendaraan, k.tipe_kendaraan, "
            "k.status, k.foto_url, k.harga_sewa_harian "
            "ORDER BY sewa_bulan_ini DESC, pendapatan_bulan_ini DESC"
        )
        
        armada = await cur.fetchall()
        for a in armada:
            a["harga_harian"] = fmt_float(a["harga_harian"])
            a["pendapatan_bulan_ini"] = fmt_float(a["pendapatan_bulan_ini"])
            
        return {"status_armada": status_armada, "total_unit": sum(status_armada.values()),
                "armada_detail": armada}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Laporan] Gagal memuat laporan armada: {e}")
        raise HTTPException(500, "Gagal memuat laporan armada.")
