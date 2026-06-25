from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from datetime import timedelta
from fastapi.security import OAuth2PasswordRequestForm
import aiomysql
from database import get_db
from config import cfg, log
from dependencies import verify_pwd, make_token, get_current_user, hash_pwd
from models import TokenPair
from pydantic import BaseModel
import uuid

class RegisterCustomerReq(BaseModel):
    nama_lengkap: str
    email: str
    no_telepon: str
    password: str

router = APIRouter(prefix="/auth", tags=["Auth"])
@router.post("/login", response_model=TokenPair, tags=["🔐 Auth"])
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    cur: aiomysql.DictCursor = Depends(get_db), # LANGSUNG TERIMA CURSOR
):
    # Parameter query diganti menjadi %(e)s
    await cur.execute(
        "SELECT id_karyawan, nama_lengkap, email, password_hash, role, is_aktif "
        "FROM KARYAWAN WHERE email = %(e)s",
        {"e": form.username},
    )
    row = await cur.fetchone()

    # Index array diganti jadi Index dictionary
    if not row or not verify_pwd(form.password, row["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email atau password salah.",
                            headers={"WWW-Authenticate": "Bearer"})
    if row["is_aktif"] == 0:
        raise HTTPException(403, "Akun telah dinonaktifkan. Hubungi Owner.")

    token_data = {"sub": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]}
    access_tok  = make_token(token_data, timedelta(minutes=cfg.ACCESS_EXPIRE_MIN))
    refresh_tok = make_token({"sub": row["id_karyawan"], "type": "refresh"},
                             timedelta(days=cfg.REFRESH_EXPIRE_DAYS))

    log.info(f"[Auth] Login: {row['email']} (role={row['role']})")
    return TokenPair(
        access_token  = access_tok,
        refresh_token = refresh_tok,
        user          = {"id": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]},
    )


@router.post("/login/customer", tags=["🔐 Auth"])
async def login_customer(
    form: OAuth2PasswordRequestForm = Depends(),
    cur: aiomysql.DictCursor = Depends(get_db),
):
    await cur.execute(
        "SELECT id_pelanggan, nama_lengkap, email, password_hash "
        "FROM PELANGGAN WHERE email = %(e)s",
        {"e": form.username},
    )
    row = await cur.fetchone()

    if not row or not row["password_hash"] or not verify_pwd(form.password, row["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email atau password salah.",
                            headers={"WWW-Authenticate": "Bearer"})

    token_data = {"sub": row["id_pelanggan"], "nama": row["nama_lengkap"], "email": row["email"], "role": "PELANGGAN"}
    access_tok  = make_token(token_data, timedelta(minutes=cfg.ACCESS_EXPIRE_MIN))
    
    log.info(f"[Auth] Login Customer: {row['email']}")
    return {
        "access_token": access_tok,
        "token_type": "bearer",
        "user": token_data
    }


@router.post("/register", tags=["🔐 Auth"])
async def register_customer(
    req: RegisterCustomerReq,
    cur: aiomysql.DictCursor = Depends(get_db),
):
    # Cek apakah email sudah dipakai
    await cur.execute("SELECT id_pelanggan FROM PELANGGAN WHERE email = %(e)s", {"e": req.email})
    if await cur.fetchone():
        raise HTTPException(400, "Email sudah terdaftar.")

    new_id = "p-" + uuid.uuid4().hex[:12]
    hashed = hash_pwd(req.password)

    await cur.execute(
        "INSERT INTO PELANGGAN (id_pelanggan, nama_lengkap, email, no_telepon, password_hash) "
        "VALUES (%(id)s, %(nama)s, %(email)s, %(telp)s, %(pwd)s)",
        {
            "id": new_id,
            "nama": req.nama_lengkap,
            "email": req.email,
            "telp": req.no_telepon,
            "pwd": hashed
        }
    )
    
    token_data = {"sub": new_id, "nama": req.nama_lengkap, "email": req.email, "role": "PELANGGAN"}
    access_tok = make_token(token_data, timedelta(minutes=cfg.ACCESS_EXPIRE_MIN))

    return {
        "message": "Registrasi berhasil",
        "access_token": access_tok,
        "token_type": "bearer",
        "user": token_data
    }
@router.post("/refresh", tags=["🔐 Auth"])
async def refresh(body: dict, cur=Depends(get_db)): # <-- oracledb dihapus, langsung pakai cur
    """Perbarui access token menggunakan refresh token yang masih valid."""
    tok = body.get("refresh_token")
    if not tok:
        raise HTTPException(400, "'refresh_token' wajib diisi.")
    payload = decode_token(tok)
    if payload.get("type") != "refresh":
        raise HTTPException(400, "Bukan token refresh yang valid.")

    # Dialek MySQL: %(id)s
    await cur.execute(
        "SELECT id_karyawan, nama_lengkap, email, role FROM KARYAWAN "
        "WHERE id_karyawan = %(id)s AND is_aktif = 1",
        {"id": payload.get("sub")},
    )
    row = await cur.fetchone()
    if not row:
        raise HTTPException(401, "User tidak ditemukan atau tidak aktif.")

    # Menggunakan kunci Dict, bukan indeks angka
    return {
        "access_token": make_token({"sub": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]},
                                   timedelta(minutes=cfg.ACCESS_EXPIRE_MIN)),
        "token_type": "bearer",
    }

