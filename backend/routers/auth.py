from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File
from typing import Optional
from datetime import timedelta
from fastapi.security import OAuth2PasswordRequestForm
import aiomysql
from database import get_db
from config import cfg, log
from dependencies import verify_pwd, make_token, decode_token, hash_pwd
from utils import imgbb_upload
from models import TokenPair
from pydantic import BaseModel
import uuid

class LoginCustomerReq(BaseModel):
    email: str
    password: str

router = APIRouter(prefix="/auth", tags=["Auth"])
@router.post("/login", response_model=TokenPair, tags=["🔐 Auth"])
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    cur: aiomysql.DictCursor = Depends(get_db),
):
    try:
        await cur.execute(
            "SELECT id_karyawan, nama_lengkap, email, password_hash, role, is_aktif "
            "FROM KARYAWAN WHERE email = %(e)s",
            {"e": form.username},
        )
        row = await cur.fetchone()

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
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Auth] Login error: {e}")
        raise HTTPException(500, "Terjadi kesalahan saat proses login.")

@router.post("/login-customer", tags=["Auth"])
async def login_customer(
    body: LoginCustomerReq,
    cur: aiomysql.DictCursor = Depends(get_db),
):
    try:
        await cur.execute(
            "SELECT id_pelanggan, nama_lengkap, email, password_hash, foto_profil_url, is_verified "
            "FROM PELANGGAN WHERE email = %(e)s",
            {"e": body.email},
        )
        row = await cur.fetchone()

        if not row or not row["password_hash"] or not verify_pwd(body.password, row["password_hash"]):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email atau password salah.")

        if row["is_verified"] == 0:
            raise HTTPException(403, "Email belum diverifikasi. Silakan cek email Anda untuk memverifikasi akun.")

        token_data = {"sub": row["id_pelanggan"], "nama": row["nama_lengkap"], "email": row["email"], "role": "CUSTOMER", "foto_profil_url": row["foto_profil_url"]}
        access_tok  = make_token(token_data, timedelta(minutes=cfg.ACCESS_EXPIRE_MIN))

        log.info(f"[Auth] Login Customer: {row['email']}")
        return {
            "access_token": access_tok,
            "token_type": "bearer",
            "user": token_data
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Auth] Login Customer error: {e}")
        raise HTTPException(500, "Terjadi kesalahan saat proses login pelanggan.")

@router.post("/register-customer", tags=["Auth"])
async def register_customer(
    nama_lengkap: str = Form(...),
    email: str = Form(...),
    no_telepon: str = Form(...),
    password: str = Form(...),
    no_ktp: Optional[str] = Form(None),
    alamat: Optional[str] = Form(None),
    foto_ktp: Optional[UploadFile] = File(None),
    foto_sim: Optional[UploadFile] = File(None),
    cur: aiomysql.DictCursor = Depends(get_db),
):
    try:
        if not nama_lengkap or not nama_lengkap.strip():
            raise HTTPException(400, "Nama lengkap wajib diisi.")
        if not email or not email.strip():
            raise HTTPException(400, "Email wajib diisi.")
        if not password or len(password) < 6:
            raise HTTPException(400, "Password minimal 6 karakter.")
        if no_ktp and no_ktp.strip():
            await cur.execute("SELECT id_pelanggan FROM PELANGGAN WHERE no_ktp = %(ktp)s", {"ktp": no_ktp})
            if await cur.fetchone():
                raise HTTPException(400, "Nomor KTP ini sudah terdaftar pada akun lain.")
        await cur.execute("SELECT id_pelanggan, is_verified FROM PELANGGAN WHERE email = %(e)s", {"e": email})
        row = await cur.fetchone()
        if row:
            if row["is_verified"] == 1:
                raise HTTPException(400, "Email sudah terdaftar dan terverifikasi.")
            else:
                await cur.execute("DELETE FROM PELANGGAN WHERE id_pelanggan = %(id)s", {"id": row["id_pelanggan"]})

        new_id = "p-" + uuid.uuid4().hex[:12]
        hashed = hash_pwd(password)

        ktp_url = None
        sim_url = None

        if foto_ktp or foto_sim:
            from utils import compress_image
            from routers.ocr import perform_ocr, _names_match
            import re

            if foto_ktp:
                ktp_bytes = await compress_image(await foto_ktp.read())
                try:
                    ktp_raw = await perform_ocr(ktp_bytes)
                    nama_match = re.search(r'(?i)Nama\s*[:;]?\s*(.+)', ktp_raw)
                    if nama_match:
                        ktp_name = nama_match.group(1).strip()
                        if not _names_match(nama_lengkap, ktp_name):
                            log.warning(f"[OCR Auth] KTP match warning: '{nama_lengkap}' != '{ktp_name}'")
                except HTTPException as e:
                    raise e
                except Exception as e:
                    log.error(f"[OCR Auth] KTP Error: {e}")
                    raise HTTPException(502, "Layanan verifikasi OCR sedang sibuk. Coba lagi nanti.")

                ktp_url = await imgbb_upload(ktp_bytes, foto_ktp.filename)

            if foto_sim:
                sim_bytes = await compress_image(await foto_sim.read())
                try:
                    sim_raw = await perform_ocr(sim_bytes)
                    if not _names_match(nama_lengkap, sim_raw):
                        log.warning(f"[OCR Auth] SIM match warning: '{nama_lengkap}' != '{sim_raw}'")
                except HTTPException as e:
                    raise e
                except Exception as e:
                    log.error(f"[OCR Auth] SIM Error: {e}")
                    raise HTTPException(502, "Layanan verifikasi OCR sedang sibuk. Coba lagi nanti.")

                sim_url = await imgbb_upload(sim_bytes, foto_sim.filename)

        await cur.execute(
            "INSERT INTO PELANGGAN (id_pelanggan, nama_lengkap, email, no_telepon, no_ktp, alamat, password_hash, foto_ktp_url, foto_sim_url, is_verified) "
            "VALUES (%(id)s, %(nama)s, %(email)s, %(telp)s, %(nik)s, %(alamat)s, %(pwd)s, %(ktp)s, %(sim)s, 0)",
            {
                "id": new_id,
                "nama": nama_lengkap,
                "email": email,
                "telp": no_telepon,
                "nik": no_ktp,
                "alamat": alamat,
                "pwd": hashed,
                "ktp": ktp_url,
                "sim": sim_url
            }
        )
        from utils import send_verification_email
        verify_token = make_token({"sub": new_id, "purpose": "verify_email"}, timedelta(hours=24))
        await send_verification_email(email, verify_token)

        return {
            "message": "Registrasi berhasil. Silakan periksa email Anda untuk verifikasi akun.",
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Auth] Register Customer error: {e}")
        raise HTTPException(500, "Terjadi kesalahan saat proses registrasi.")

class VerifyEmailReq(BaseModel):
    token: str

@router.post("/verify-email", tags=["Auth"])
async def verify_email_customer(body: VerifyEmailReq, cur: aiomysql.DictCursor = Depends(get_db)):
    try:
        payload = decode_token(body.token)
        if payload.get("purpose") != "verify_email":
            raise HTTPException(400, "Token tidak valid untuk verifikasi email.")

        pelanggan_id = payload.get("sub")
        await cur.execute("UPDATE PELANGGAN SET is_verified = 1 WHERE id_pelanggan = %(id)s", {"id": pelanggan_id})

        return {"message": "Email berhasil diverifikasi. Anda sekarang dapat masuk."}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Auth] Gagal memverifikasi email: {e}")
        raise HTTPException(400, "Token verifikasi tidak valid atau telah kedaluwarsa.")

@router.post("/refresh", tags=["🔐 Auth"])
async def refresh(body: dict, cur=Depends(get_db)):

    try:
        tok = body.get("refresh_token")
        if not tok:
            raise HTTPException(400, "'refresh_token' wajib diisi.")
        payload = decode_token(tok)
        if payload.get("type") != "refresh":
            raise HTTPException(400, "Bukan token refresh yang valid.")

        await cur.execute(
            "SELECT id_karyawan, nama_lengkap, email, role FROM KARYAWAN "
            "WHERE id_karyawan = %(id)s AND is_aktif = 1",
            {"id": payload.get("sub")},
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(401, "User tidak ditemukan atau tidak aktif.")

        return {
            "access_token": make_token({"sub": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]},
                                       timedelta(minutes=cfg.ACCESS_EXPIRE_MIN)),
            "token_type": "bearer",
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Auth] Refresh token error: {e}")
        raise HTTPException(500, "Terjadi kesalahan saat memperbarui token.")
