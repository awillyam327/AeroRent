from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date

class TokenPair(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str  = "bearer"
    user:          dict


class KaryawanIn(BaseModel):
    nama_lengkap:   str
    email:          str
    no_telepon:     Optional[str]   = None
    password:       str
    role:           str
    gaji_per_bulan: Optional[float] = 0

    @field_validator("role")
    @classmethod
    def cek_role(cls, v: str) -> str:
        if v not in ("OWNER", "KASIR"):
            raise ValueError("role harus 'OWNER' atau 'KASIR'")
        return v


class KaryawanUpd(BaseModel):
    nama_lengkap:   Optional[str]   = None
    no_telepon:     Optional[str]   = None
    is_aktif:       Optional[int]   = None
    gaji_per_bulan: Optional[float] = None


class KendaraanIn(BaseModel):
    nama_kendaraan:       str
    merk:                 str
    model:                Optional[str]   = None
    tahun:                int
    nomor_plat:           str
    tipe_kendaraan:       str             # '5_SEATER'|'7_SEATER'|'MICROBUS'
    transmisi:            str             = "AT"
    bahan_bakar:          str             = "Bensin"
    kapasitas_penumpang:  Optional[int]   = None
    harga_sewa_harian:    float
    harga_supir_harian:   float           = 150_000
    is_featured:          int             = 0
    traccar_device_id:    Optional[str]   = None
    deskripsi:            Optional[str]   = None

    @field_validator("tipe_kendaraan")
    @classmethod
    def cek_tipe(cls, v: str) -> str:
        if v not in ("5_SEATER", "7_SEATER", "MICROBUS"):
            raise ValueError("tipe_kendaraan harus: 5_SEATER | 7_SEATER | MICROBUS")
        return v


class KendaraanUpd(BaseModel):
    nama_kendaraan:     Optional[str]   = None
    harga_sewa_harian:  Optional[float] = None
    harga_supir_harian: Optional[float] = None
    status:             Optional[str]   = None
    is_featured:        Optional[int]   = None
    traccar_device_id:  Optional[str]   = None
    foto_url:           Optional[str]   = None
    deskripsi:          Optional[str]   = None


class PelangganIn(BaseModel):
    nama_lengkap: str
    no_telepon:   str
    email:        Optional[str] = None
    alamat:       Optional[str] = None
    no_ktp:       Optional[str] = None


class TransaksiIn(BaseModel):
    id_pelanggan:           str
    id_kendaraan:           str
    tanggal_mulai:          date
    tanggal_selesai_rencana: date
    gunakan_supir:          int             = 0
    metode_pembayaran:      Optional[str]   = None
    catatan_kasir:          Optional[str]   = None

    @field_validator("tanggal_selesai_rencana")
    @classmethod
    def cek_tgl(cls, v: date, info) -> date:
        if "tanggal_mulai" in (info.data or {}) and v < info.data["tanggal_mulai"]:
            raise ValueError("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.")
        return v


class StatusUpd(BaseModel):
    status:                 str
    catatan_kasir:          Optional[str]   = None
    biaya_denda_kerusakan:  Optional[float] = None
    biaya_tambahan_lain:    Optional[float] = None


class PengeluaranIn(BaseModel):
    id_kendaraan:       Optional[str]   = None
    kategori:           str
    deskripsi:          str
    jumlah:             float
    tanggal_pengeluaran: date
    catatan:            Optional[str]   = None

