from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date, datetime
import re
_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
VALID_ROLES       = ("OWNER", "KASIR", "SUPIR")
VALID_TIPE_KEND   = ("5_SEATER", "7_SEATER", "MICROBUS")
VALID_STATUS_KEND = ("TERSEDIA", "DISEWA", "PERAWATAN")
VALID_STATUS_TRX  = ("MENUNGGU", "DIKONFIRMASI", "AKTIF", "SELESAI", "DIBATALKAN")
VALID_PAKET_SEWA  = ("HARIAN", "BULANAN")
VALID_KATEGORI_PO = ("PERAWATAN", "SERVIS", "BBM", "ASURANSI", "PAJAK", "GAJI", "OPERASIONAL", "LAINNYA")

class TokenPair(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str  = "bearer"
    user:          dict

class KaryawanIn(BaseModel):
    nama_lengkap:   str   = Field(..., min_length=2, max_length=200)
    email:          Optional[str] = Field(None, max_length=200)
    no_telepon:     Optional[str]   = Field(None, max_length=20)
    password:       Optional[str]   = Field(None, max_length=200)
    role:           str
    gaji_per_bulan: Optional[float] = Field(0, ge=0)

    @field_validator("role")
    @classmethod
    def cek_role(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in VALID_ROLES:
            raise ValueError(f"role harus salah satu dari: {', '.join(VALID_ROLES)}")
        return v

    @field_validator("email")
    @classmethod
    def cek_email(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Format email tidak valid.")
        return v

class KaryawanUpd(BaseModel):
    nama_lengkap:   Optional[str]   = Field(None, min_length=2, max_length=200)
    no_telepon:     Optional[str]   = Field(None, max_length=20)
    is_aktif:       Optional[int]   = Field(None, ge=0, le=1)
    gaji_per_bulan: Optional[float] = Field(None, ge=0)

class KendaraanIn(BaseModel):
    nama_kendaraan:       str   = Field(..., min_length=2, max_length=200)
    merk:                 str   = Field(..., min_length=1, max_length=100)
    model:                Optional[str]   = Field(None, max_length=200)
    tahun:                int   = Field(..., ge=1990, le=2035)
    nomor_plat:           str   = Field(..., min_length=3, max_length=20)
    tipe_kendaraan:       str             # '5_SEATER'|'7_SEATER'|'MICROBUS'
    transmisi:            str             = Field("AT", max_length=10)
    bahan_bakar:          str             = Field("Bensin", max_length=20)
    kapasitas_penumpang:  Optional[int]   = Field(None, ge=1, le=50)
    harga_sewa_harian:    float = Field(..., gt=0)
    harga_supir_harian:   float = Field(150_000, ge=0)
    is_featured:          int   = Field(0, ge=0, le=1)
    traccar_device_id:    Optional[str]   = Field(None, max_length=100)
    deskripsi:            Optional[str]   = Field(None, max_length=2000)

    @field_validator("tipe_kendaraan")
    @classmethod
    def cek_tipe(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in VALID_TIPE_KEND:
            raise ValueError(f"tipe_kendaraan harus: {' | '.join(VALID_TIPE_KEND)}")
        return v

class KendaraanUpd(BaseModel):
    nama_kendaraan:     Optional[str]   = Field(None, min_length=2, max_length=200)
    harga_sewa_harian:  Optional[float] = Field(None, gt=0)
    harga_supir_harian: Optional[float] = Field(None, ge=0)
    status:             Optional[str]   = None
    is_featured:        Optional[int]   = Field(None, ge=0, le=1)
    traccar_device_id:  Optional[str]   = Field(None, max_length=100)
    foto_url:           Optional[str]   = Field(None, max_length=1000)
    deskripsi:          Optional[str]   = Field(None, max_length=2000)

    @field_validator("status")
    @classmethod
    def cek_status_kend(cls, v):
        if v is None:
            return v
        v = v.upper().strip()
        if v not in VALID_STATUS_KEND:
            raise ValueError(f"status harus: {' | '.join(VALID_STATUS_KEND)}")
        return v

class PelangganIn(BaseModel):
    nama_lengkap: str = Field(..., min_length=2, max_length=200)
    no_telepon:   str = Field(..., min_length=8, max_length=20)
    email:        Optional[str] = Field(None, max_length=200)
    alamat:       Optional[str] = Field(None, max_length=500)
    no_ktp:       Optional[str] = Field(None, min_length=16, max_length=16)

class TransaksiIn(BaseModel):
    id_pelanggan:           str = Field(..., min_length=1, max_length=100)
    id_kendaraan:           str = Field(..., min_length=1, max_length=100)
    tanggal_mulai:          datetime
    tanggal_selesai_rencana: datetime
    gunakan_supir:          int = Field(0, ge=0, le=1)
    id_supir:               Optional[str]   = Field(None, max_length=100)
    metode_pembayaran:      Optional[str]   = Field(None, max_length=30)
    catatan_kasir:          Optional[str]   = Field(None, max_length=1000)
    paket_sewa:             str             = "HARIAN"

    @field_validator("tanggal_selesai_rencana")
    @classmethod
    def cek_tgl(cls, v: datetime, info) -> datetime:
        if "tanggal_mulai" in (info.data or {}) and v < info.data["tanggal_mulai"]:
            raise ValueError("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.")
        return v

    @field_validator("paket_sewa")
    @classmethod
    def cek_paket(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in VALID_PAKET_SEWA:
            raise ValueError(f"paket_sewa harus: {' | '.join(VALID_PAKET_SEWA)}")
        return v

class SupirUpd(BaseModel):
    id_supir: str = Field(..., max_length=100)

class StatusUpd(BaseModel):
    status:                 str = Field(..., min_length=1)
    catatan_kasir:          Optional[str]   = Field(None, max_length=1000)
    biaya_denda_kerusakan:  Optional[float] = Field(None, ge=0)
    biaya_tambahan_lain:    Optional[float] = Field(None, ge=0)

    @field_validator("status")
    @classmethod
    def cek_status(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in VALID_STATUS_TRX:
            raise ValueError(f"status harus: {' | '.join(VALID_STATUS_TRX)}")
        return v

class PerpanjanganIn(BaseModel):
    paket_sewa: str = Field(..., max_length=10) # 'HARIAN' atau 'BULANAN'
    tambahan_hari: int = Field(..., gt=0)

    @field_validator("paket_sewa")
    @classmethod
    def cek_paket_ext(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in VALID_PAKET_SEWA:
            raise ValueError(f"paket_sewa harus: {' | '.join(VALID_PAKET_SEWA)}")
        return v

class PengeluaranIn(BaseModel):
    id_kendaraan:       Optional[str]   = Field(None, max_length=100)
    kategori:           str = Field(..., min_length=1, max_length=50)
    deskripsi:          str = Field(..., min_length=1, max_length=500)
    jumlah:             float = Field(..., gt=0)
    tanggal_pengeluaran: date
    catatan:            Optional[str]   = Field(None, max_length=1000)

    @field_validator("kategori")
    @classmethod
    def cek_kategori(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in VALID_KATEGORI_PO:
            raise ValueError(f"kategori harus: {' | '.join(VALID_KATEGORI_PO)}")
        return v

class TambahSupirIn(BaseModel):
    durasi_hari: int = Field(..., gt=0, le=90)
