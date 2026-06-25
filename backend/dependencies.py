from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timezone, timedelta
import jwt
import aiomysql
from database import get_db
from config import cfg

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def hash_pwd(plain: str) -> str:
    import bcrypt
    # Menggunakan bcrypt murni tanpa perantara passlib
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_pwd(plain: str, hashed: str) -> bool:
    import bcrypt
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))

def make_token(payload: dict, expire_delta: timedelta) -> str:
    data = {
        **payload,
        "exp": datetime.now(timezone.utc) + expire_delta,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(data, cfg.JWT_SECRET, algorithm=cfg.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, cfg.JWT_SECRET, algorithms=[cfg.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token kadaluarsa. Silakan login kembali.",
                            headers={"WWW-Authenticate": "Bearer"})
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token tidak valid.",
                            headers={"WWW-Authenticate": "Bearer"})


# ==============================================================================
# DEPENDENCY: Autentikasi & RBAC
# ==============================================================================
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    cur: aiomysql.DictCursor = Depends(get_db), # SEKARANG LANGSUNG TERIMA CURSOR
) -> dict:
    payload = decode_token(token)
    uid: str = payload.get("sub", "")
    if not uid:
        raise HTTPException(401, "Token tidak memiliki subject yang valid.")

    # PERHATIKAN: :uid diganti menjadi %(uid)s
    await cur.execute(
        "SELECT id_karyawan, nama_lengkap, email, role, is_aktif "
        "FROM KARYAWAN WHERE id_karyawan = %(uid)s",
        {"uid": uid},
    )
    row = await cur.fetchone()
    if not row:
        raise HTTPException(401, "User tidak ditemukan.")
    
    # PERHATIKAN: row[4] diganti menjadi row["is_aktif"]
    if row["is_aktif"] == 0:
        raise HTTPException(403, "Akun telah dinonaktifkan oleh Owner.")

    return {"id": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]}


async def req_owner(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "OWNER":
        raise HTTPException(403, "Endpoint ini hanya dapat diakses oleh OWNER.")
    return user


async def req_kasir_or_owner(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("KASIR", "OWNER"):
        raise HTTPException(403, "Diperlukan role KASIR atau OWNER.")
    return user

