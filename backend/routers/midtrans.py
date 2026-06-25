from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional
import aiomysql
import hashlib
from database import get_db
from config import cfg, log

router = APIRouter(prefix="/webhook", tags=["Webhook"])
@router.post("/midtrans", tags=["🔔 Webhook"])
async def webhook_midtrans(request: Request, cur=Depends(get_db)):
    payload      = await request.json()
    order_id     = payload.get("order_id", "")
    trx_status   = payload.get("transaction_status", "")
    status_code  = payload.get("status_code", "")
    gross_amount = payload.get("gross_amount", "0.00")
    recv_sig     = payload.get("signature_key", "")

    raw = f"{order_id}{status_code}{gross_amount}{cfg.MIDTRANS_SERVER_KEY}"
    expected = hashlib.sha512(raw.encode()).hexdigest()
    if recv_sig != expected:
        log.warning(f"[Midtrans Webhook] Signature TIDAK VALID: order={order_id}")
        raise HTTPException(403, "Signature Midtrans tidak valid.")

    STATUS_MAP = {
        "settlement": "LUNAS", "capture": "LUNAS",
        "pending": "BELUM_LUNAS", "deny": "BELUM_LUNAS",
        "cancel": "BELUM_LUNAS", "expire": "BELUM_LUNAS",
    }
    await cur.execute(
        "UPDATE TRANSAKSI_SEWA "
        "SET midtrans_status = %(ms)s, midtrans_transaction_id = %(mti)s, status_pembayaran = %(sp)s "
        "WHERE midtrans_order_id = %(oid)s",
        {"ms": trx_status, "mti": payload.get("transaction_id"),
         "sp": STATUS_MAP.get(trx_status, "BELUM_LUNAS"), "oid": order_id},
    )
    log.info(f"[Midtrans Webhook] order={order_id}, status={trx_status}")
    return {"status": "OK"}

