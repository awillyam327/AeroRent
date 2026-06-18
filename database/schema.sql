-- ==============================================================================
-- AERORENT — ORACLE 19c DATABASE SCHEMA
-- Sistem Manajemen Armada & POS — Salatiga
-- Versi   : 1.0.0  |  Engine: Oracle Database 19c Enterprise Edition
-- Catatan : Jalankan sebagai user pemilik schema (bukan SYS), atau prefix
--           semua nama objek dengan nama schema Anda.
-- ==============================================================================

-- Hapus objek lama (urutan reverse FK agar tidak error)
BEGIN EXECUTE IMMEDIATE 'DROP TABLE PENGELUARAN_OPERASIONAL CASCADE CONSTRAINTS PURGE'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE TRANSAKSI_SEWA CASCADE CONSTRAINTS PURGE';         EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE KENDARAAN CASCADE CONSTRAINTS PURGE';               EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE PELANGGAN CASCADE CONSTRAINTS PURGE';               EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE KARYAWAN CASCADE CONSTRAINTS PURGE';                EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE SEQ_NOMOR_BOOKING';       EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE SEQ_NOMOR_PENGELUARAN';   EXCEPTION WHEN OTHERS THEN NULL; END;
/

-- ==============================================================================
-- TABEL 1: KARYAWAN
-- Menyimpan semua pengguna sistem (OWNER & KASIR) dengan RBAC.
-- ==============================================================================
CREATE TABLE KARYAWAN (
    id_karyawan       VARCHAR2(50)    NOT NULL,
    nama_lengkap      VARCHAR2(100)   NOT NULL,
    email             VARCHAR2(100)   NOT NULL,
    no_telepon        VARCHAR2(25),
    password_hash     VARCHAR2(255)   NOT NULL,
    role              VARCHAR2(20)    NOT NULL,          -- 'OWNER' | 'KASIR'
    is_aktif          NUMBER(1,0)     DEFAULT 1  NOT NULL,
    foto_profil_url   VARCHAR2(500),
    tanggal_masuk     DATE            DEFAULT SYSDATE NOT NULL,
    gaji_per_bulan    NUMBER(12,2)    DEFAULT 0,
    created_at        TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at        TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_karyawan          PRIMARY KEY (id_karyawan),
    CONSTRAINT uq_karyawan_email    UNIQUE  (email),
    CONSTRAINT ck_karyawan_role     CHECK   (role IN ('OWNER','KASIR')),
    CONSTRAINT ck_karyawan_aktif    CHECK   (is_aktif IN (0,1))
);
COMMENT ON TABLE  KARYAWAN              IS 'Master data karyawan — dasar RBAC sistem';
COMMENT ON COLUMN KARYAWAN.id_karyawan  IS 'UUID v4: contoh "k-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"';
COMMENT ON COLUMN KARYAWAN.role         IS 'OWNER: akses penuh termasuk laporan. KASIR: akses POS & operasional lapangan.';
COMMENT ON COLUMN KARYAWAN.is_aktif     IS 'Soft-delete: 1=Aktif (dapat login), 0=Dinonaktifkan';

-- ==============================================================================
-- TABEL 2: KENDARAAN
-- Inventaris lengkap armada kendaraan rental.
-- ==============================================================================
CREATE TABLE KENDARAAN (
    id_kendaraan          VARCHAR2(50)    NOT NULL,
    nama_kendaraan        VARCHAR2(100)   NOT NULL,
    merk                  VARCHAR2(50)    NOT NULL,
    model                 VARCHAR2(60),
    tahun                 NUMBER(4,0)     NOT NULL,
    nomor_plat            VARCHAR2(15)    NOT NULL,
    tipe_kendaraan        VARCHAR2(20)    NOT NULL,      -- '5_SEATER'|'7_SEATER'|'MICROBUS'
    transmisi             VARCHAR2(10)    DEFAULT 'AT'      NOT NULL,  -- 'AT'|'MT'
    bahan_bakar           VARCHAR2(15)    DEFAULT 'Bensin'  NOT NULL,
    kapasitas_penumpang   NUMBER(3,0),
    harga_sewa_harian     NUMBER(12,2)    NOT NULL,
    harga_supir_harian    NUMBER(12,2)    DEFAULT 150000    NOT NULL,
    status                VARCHAR2(20)    DEFAULT 'TERSEDIA' NOT NULL, -- 'TERSEDIA'|'DISEWA'|'PERAWATAN'
    foto_url              VARCHAR2(500),
    deskripsi             CLOB,
    is_featured           NUMBER(1,0)     DEFAULT 0         NOT NULL,
    traccar_device_id     VARCHAR2(50),
    odometer_km           NUMBER(10,0)    DEFAULT 0,
    created_at            TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at            TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_kendaraan             PRIMARY KEY (id_kendaraan),
    CONSTRAINT uq_kendaraan_plat        UNIQUE  (nomor_plat),
    CONSTRAINT ck_kendaraan_tipe        CHECK   (tipe_kendaraan IN ('5_SEATER','7_SEATER','MICROBUS')),
    CONSTRAINT ck_kendaraan_status      CHECK   (status IN ('TERSEDIA','DISEWA','PERAWATAN')),
    CONSTRAINT ck_kendaraan_transmisi   CHECK   (transmisi IN ('AT','MT')),
    CONSTRAINT ck_kendaraan_bbm         CHECK   (bahan_bakar IN ('Bensin','Solar','Hybrid','Listrik')),
    CONSTRAINT ck_kendaraan_featured    CHECK   (is_featured IN (0,1)),
    CONSTRAINT ck_harga_positif         CHECK   (harga_sewa_harian > 0)
);
COMMENT ON TABLE  KENDARAAN                   IS 'Master inventaris armada kendaraan';
COMMENT ON COLUMN KENDARAAN.tipe_kendaraan    IS '5_SEATER | 7_SEATER | MICROBUS';
COMMENT ON COLUMN KENDARAAN.status            IS 'TERSEDIA | DISEWA | PERAWATAN — diupdate otomatis oleh backend';
COMMENT ON COLUMN KENDARAAN.traccar_device_id IS 'ID perangkat GPS Traccar untuk live-tracking (NFR-07)';
COMMENT ON COLUMN KENDARAAN.is_featured       IS '1 = tampil sebagai Armada Unggulan di homepage';

-- ==============================================================================
-- TABEL 3: PELANGGAN
-- Data penyewa kendaraan beserta dokumen identitas.
-- ==============================================================================
CREATE TABLE PELANGGAN (
    id_pelanggan    VARCHAR2(50)    NOT NULL,
    nama_lengkap    VARCHAR2(100)   NOT NULL,
    email           VARCHAR2(100),
    no_telepon      VARCHAR2(25)    NOT NULL,
    alamat          CLOB,
    no_ktp          VARCHAR2(25),
    foto_ktp_url    VARCHAR2(500),                       -- URL ImgBB
    foto_sim_url    VARCHAR2(500),                       -- URL ImgBB
    is_verified     NUMBER(1,0)     DEFAULT 0  NOT NULL, -- 1=KTP sudah diverifikasi kasir
    created_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_pelanggan           PRIMARY KEY (id_pelanggan),
    CONSTRAINT ck_pelanggan_verified  CHECK (is_verified IN (0,1))
);
COMMENT ON TABLE  PELANGGAN              IS 'Data penyewa kendaraan AeroRent';
COMMENT ON COLUMN PELANGGAN.foto_ktp_url IS 'URL foto KTP permanen di ImgBB (FR-03)';
COMMENT ON COLUMN PELANGGAN.is_verified  IS '1 = KTP/SIM terverifikasi secara fisik oleh kasir';

-- ==============================================================================
-- SEQUENCE: Auto-generate nomor booking & nomor pengeluaran
-- ==============================================================================
CREATE SEQUENCE SEQ_NOMOR_BOOKING
    START WITH 1001  INCREMENT BY 1  NOCACHE  NOCYCLE;

CREATE SEQUENCE SEQ_NOMOR_PENGELUARAN
    START WITH 1     INCREMENT BY 1  NOCACHE  NOCYCLE;

-- ==============================================================================
-- TABEL 4: TRANSAKSI_SEWA
-- Inti sistem — siklus hidup lengkap setiap transaksi sewa.
-- Status lifecycle: MENUNGGU → DIKONFIRMASI → AKTIF → SELESAI | DIBATALKAN
-- ==============================================================================
CREATE TABLE TRANSAKSI_SEWA (
    id_transaksi              VARCHAR2(50)    NOT NULL,
    nomor_booking             VARCHAR2(20)    NOT NULL,          -- AR-20261001 (auto-trigger)
    id_pelanggan              VARCHAR2(50)    NOT NULL,
    id_kendaraan              VARCHAR2(50)    NOT NULL,
    id_karyawan_kasir         VARCHAR2(50),                      -- Kasir yang memproses (nullable: booking web)

    -- Jadwal
    tanggal_mulai             DATE            NOT NULL,
    tanggal_selesai_rencana   DATE            NOT NULL,
    tanggal_selesai_aktual    TIMESTAMP,                         -- FR-05: catat saat pengembalian fisik
    durasi_hari_rencana       NUMBER(5,0)     NOT NULL,

    -- Pilihan
    gunakan_supir             NUMBER(1,0)     DEFAULT 0  NOT NULL,

    -- Biaya (semua kalkulasi dilakukan backend, disimpan akhir)
    biaya_sewa                NUMBER(12,2)    NOT NULL,
    biaya_supir               NUMBER(12,2)    DEFAULT 0  NOT NULL,
    biaya_denda_terlambat     NUMBER(12,2)    DEFAULT 0  NOT NULL,  -- FR-06: otomatis
    biaya_denda_kerusakan     NUMBER(12,2)    DEFAULT 0  NOT NULL,  -- Input manual kasir
    biaya_tambahan_lain       NUMBER(12,2)    DEFAULT 0  NOT NULL,
    total_biaya               NUMBER(12,2)    NOT NULL,

    -- Pembayaran
    metode_pembayaran         VARCHAR2(30),                      -- 'TUNAI'|'TRANSFER'|'QRIS'|'MIDTRANS'
    midtrans_order_id         VARCHAR2(100),
    midtrans_transaction_id   VARCHAR2(100),
    midtrans_status           VARCHAR2(50),
    status_pembayaran         VARCHAR2(20)    DEFAULT 'BELUM_LUNAS' NOT NULL,

    -- Status & Dokumentasi
    status                    VARCHAR2(25)    DEFAULT 'MENUNGGU'   NOT NULL,
    foto_kondisi_sebelum      CLOB,                               -- JSON array [{posisi, url}]
    foto_kondisi_sesudah      CLOB,                               -- JSON array [{posisi, url}] (FR-07: wajib)
    catatan_kerusakan         CLOB,
    catatan_kasir             CLOB,

    created_at    TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at    TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,

    CONSTRAINT pk_transaksi_sewa      PRIMARY KEY (id_transaksi),
    CONSTRAINT uq_nomor_booking       UNIQUE  (nomor_booking),
    CONSTRAINT fk_ts_pelanggan        FOREIGN KEY (id_pelanggan)      REFERENCES PELANGGAN(id_pelanggan),
    CONSTRAINT fk_ts_kendaraan        FOREIGN KEY (id_kendaraan)      REFERENCES KENDARAAN(id_kendaraan),
    CONSTRAINT fk_ts_karyawan         FOREIGN KEY (id_karyawan_kasir) REFERENCES KARYAWAN(id_karyawan),
    CONSTRAINT ck_ts_status           CHECK (status IN ('MENUNGGU','DIKONFIRMASI','AKTIF','SELESAI','DIBATALKAN')),
    CONSTRAINT ck_ts_supir            CHECK (gunakan_supir IN (0,1)),
    CONSTRAINT ck_ts_status_bayar     CHECK (status_pembayaran IN ('BELUM_LUNAS','DP','LUNAS')),
    CONSTRAINT ck_ts_tanggal          CHECK (tanggal_selesai_rencana >= tanggal_mulai)
);
COMMENT ON TABLE  TRANSAKSI_SEWA                        IS 'Inti sistem: siklus hidup lengkap transaksi sewa';
COMMENT ON COLUMN TRANSAKSI_SEWA.nomor_booking          IS 'Format AR-YYYY{4-digit seq}, di-generate trigger setiap INSERT';
COMMENT ON COLUMN TRANSAKSI_SEWA.tanggal_selesai_aktual IS 'FR-05: timestamp aktual pengembalian fisik kendaraan';
COMMENT ON COLUMN TRANSAKSI_SEWA.biaya_denda_terlambat  IS 'FR-06: dihitung otomatis backend = hari_telat × harga_harian × 1.5';
COMMENT ON COLUMN TRANSAKSI_SEWA.foto_kondisi_sesudah   IS 'FR-07: wajib 3 foto (depan/samping/belakang) sebelum status SELESAI';

-- ==============================================================================
-- TABEL 5: PENGELUARAN_OPERASIONAL
-- Semua pengeluaran bisnis untuk perhitungan laba-rugi Owner.
-- ==============================================================================
CREATE TABLE PENGELUARAN_OPERASIONAL (
    id_pengeluaran      VARCHAR2(50)    NOT NULL,
    nomor_pengeluaran   VARCHAR2(20),                              -- PO-20261001 (auto-trigger)
    id_karyawan         VARCHAR2(50)    NOT NULL,                  -- Siapa yang mencatat
    id_kendaraan        VARCHAR2(50),                              -- Nullable: pengeluaran spesifik unit
    kategori            VARCHAR2(50)    NOT NULL,
    -- 'PERAWATAN'|'SERVIS'|'BBM'|'ASURANSI'|'PAJAK'|'GAJI'|'OPERASIONAL'|'LAINNYA'
    deskripsi           VARCHAR2(500)   NOT NULL,
    jumlah              NUMBER(12,2)    NOT NULL,
    tanggal_pengeluaran DATE            NOT NULL,
    bukti_url           VARCHAR2(500),                             -- URL bukti struk di ImgBB
    catatan             CLOB,
    created_at          TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_pengeluaran         PRIMARY KEY (id_pengeluaran),
    CONSTRAINT fk_po_karyawan         FOREIGN KEY (id_karyawan)  REFERENCES KARYAWAN(id_karyawan),
    CONSTRAINT fk_po_kendaraan        FOREIGN KEY (id_kendaraan) REFERENCES KENDARAAN(id_kendaraan),
    CONSTRAINT ck_po_kategori         CHECK (kategori IN ('PERAWATAN','SERVIS','BBM','ASURANSI','PAJAK','GAJI','OPERASIONAL','LAINNYA')),
    CONSTRAINT ck_po_jumlah           CHECK (jumlah > 0)
);
COMMENT ON TABLE PENGELUARAN_OPERASIONAL IS 'Pengeluaran operasional bisnis — diakumulasi ke laporan laba-rugi Owner';

-- ==============================================================================
-- TRIGGER 1: Auto-update kolom updated_at setiap ada perubahan record
-- ==============================================================================
CREATE OR REPLACE TRIGGER trg_karyawan_upd   BEFORE UPDATE ON KARYAWAN             FOR EACH ROW BEGIN :NEW.updated_at := SYSTIMESTAMP; END; /
CREATE OR REPLACE TRIGGER trg_kendaraan_upd  BEFORE UPDATE ON KENDARAAN            FOR EACH ROW BEGIN :NEW.updated_at := SYSTIMESTAMP; END; /
CREATE OR REPLACE TRIGGER trg_pelanggan_upd  BEFORE UPDATE ON PELANGGAN            FOR EACH ROW BEGIN :NEW.updated_at := SYSTIMESTAMP; END; /
CREATE OR REPLACE TRIGGER trg_transaksi_upd  BEFORE UPDATE ON TRANSAKSI_SEWA       FOR EACH ROW BEGIN :NEW.updated_at := SYSTIMESTAMP; END; /

-- ==============================================================================
-- TRIGGER 2: Auto-generate nomor_booking unik saat INSERT transaksi
-- Format: AR-{YYYY}{4-digit seq}  →  contoh: AR-20261001
-- ==============================================================================
CREATE OR REPLACE TRIGGER trg_gen_nomor_booking
    BEFORE INSERT ON TRANSAKSI_SEWA FOR EACH ROW
BEGIN
    IF :NEW.nomor_booking IS NULL THEN
        :NEW.nomor_booking := 'AR-' || TO_CHAR(SYSDATE, 'YYYY') || LPAD(SEQ_NOMOR_BOOKING.NEXTVAL, 4, '0');
    END IF;
END;
/

-- ==============================================================================
-- TRIGGER 3: Auto-generate nomor_pengeluaran saat INSERT
-- ==============================================================================
CREATE OR REPLACE TRIGGER trg_gen_nomor_pengeluaran
    BEFORE INSERT ON PENGELUARAN_OPERASIONAL FOR EACH ROW
BEGIN
    IF :NEW.nomor_pengeluaran IS NULL THEN
        :NEW.nomor_pengeluaran := 'PO-' || TO_CHAR(SYSDATE, 'YYYY') || LPAD(SEQ_NOMOR_PENGELUARAN.NEXTVAL, 4, '0');
    END IF;
END;
/

-- ==============================================================================
-- INDEX: Optimasi query yang paling sering dieksekusi
-- ==============================================================================
CREATE INDEX idx_kend_status       ON KENDARAAN(status);
CREATE INDEX idx_kend_tipe         ON KENDARAAN(tipe_kendaraan);
CREATE INDEX idx_kend_featured     ON KENDARAAN(is_featured);
CREATE INDEX idx_ts_status         ON TRANSAKSI_SEWA(status);
CREATE INDEX idx_ts_pelanggan      ON TRANSAKSI_SEWA(id_pelanggan);
CREATE INDEX idx_ts_kendaraan      ON TRANSAKSI_SEWA(id_kendaraan);
CREATE INDEX idx_ts_tanggal        ON TRANSAKSI_SEWA(tanggal_mulai, tanggal_selesai_rencana);
CREATE INDEX idx_ts_booking        ON TRANSAKSI_SEWA(nomor_booking);
CREATE INDEX idx_ts_midtrans       ON TRANSAKSI_SEWA(midtrans_order_id);
CREATE INDEX idx_po_tanggal        ON PENGELUARAN_OPERASIONAL(tanggal_pengeluaran);
CREATE INDEX idx_po_kategori       ON PENGELUARAN_OPERASIONAL(kategori);

-- ==============================================================================
-- DATA SEED: Data awal wajib ada sebelum sistem dijalankan
-- PENTING: Ganti nilai password_hash dengan hash bcrypt yang digenerate Python:
--   from passlib.hash import bcrypt; print(bcrypt.hash("Password@2026"))
-- ==============================================================================
INSERT INTO KARYAWAN (id_karyawan, nama_lengkap, email, no_telepon, password_hash, role, gaji_per_bulan)
VALUES ('k-owner-001','Bapak Owner','owner@aerorent.id','+628123456789',
        '$2b$12$GANTI_HASH_BCRYPT_OWNER_DI_SINI','OWNER',5000000);

INSERT INTO KARYAWAN (id_karyawan, nama_lengkap, email, no_telepon, password_hash, role, gaji_per_bulan)
VALUES ('k-kasir-001','Admin Kasir','kasir@aerorent.id','+628987654321',
        '$2b$12$GANTI_HASH_BCRYPT_KASIR_DI_SINI','KASIR',3000000);

INSERT INTO KENDARAAN (id_kendaraan,nama_kendaraan,merk,model,tahun,nomor_plat,tipe_kendaraan,transmisi,bahan_bakar,kapasitas_penumpang,harga_sewa_harian,is_featured,status)
VALUES ('kend-001','Honda Brio RS 2023','Honda','Brio RS',2023,'H 1001 AB','5_SEATER','AT','Bensin',5,300000,1,'TERSEDIA');
INSERT INTO KENDARAAN (id_kendaraan,nama_kendaraan,merk,model,tahun,nomor_plat,tipe_kendaraan,transmisi,bahan_bakar,kapasitas_penumpang,harga_sewa_harian,is_featured,status)
VALUES ('kend-002','Honda CR-V 2022','Honda','CR-V 1.5T',2022,'H 1002 CD','5_SEATER','AT','Bensin',5,650000,0,'TERSEDIA');
INSERT INTO KENDARAAN (id_kendaraan,nama_kendaraan,merk,model,tahun,nomor_plat,tipe_kendaraan,transmisi,bahan_bakar,kapasitas_penumpang,harga_sewa_harian,is_featured,status)
VALUES ('kend-003','Toyota Avanza 2022','Toyota','Avanza 1.3G',2022,'H 1003 EF','7_SEATER','MT','Bensin',7,350000,0,'TERSEDIA');
INSERT INTO KENDARAAN (id_kendaraan,nama_kendaraan,merk,model,tahun,nomor_plat,tipe_kendaraan,transmisi,bahan_bakar,kapasitas_penumpang,harga_sewa_harian,is_featured,status)
VALUES ('kend-004','Toyota Innova Reborn 2023','Toyota','Kijang Innova Reborn 2.0G',2023,'H 1004 GH','7_SEATER','AT','Bensin',7,750000,1,'DISEWA');
INSERT INTO KENDARAAN (id_kendaraan,nama_kendaraan,merk,model,tahun,nomor_plat,tipe_kendaraan,transmisi,bahan_bakar,kapasitas_penumpang,harga_sewa_harian,is_featured,status)
VALUES ('kend-005','Mitsubishi Pajero Sport 2022','Mitsubishi','Pajero Sport Dakar',2022,'H 1005 IJ','7_SEATER','AT','Solar',7,950000,1,'TERSEDIA');
INSERT INTO KENDARAAN (id_kendaraan,nama_kendaraan,merk,model,tahun,nomor_plat,tipe_kendaraan,transmisi,bahan_bakar,kapasitas_penumpang,harga_sewa_harian,is_featured,status)
VALUES ('kend-006','Toyota Hiace Commuter 2023','Toyota','Hiace Commuter 3.0',2023,'H 1006 KL','MICROBUS','MT','Solar',14,1200000,0,'TERSEDIA');
INSERT INTO KENDARAAN (id_kendaraan,nama_kendaraan,merk,model,tahun,nomor_plat,tipe_kendaraan,transmisi,bahan_bakar,kapasitas_penumpang,harga_sewa_harian,is_featured,status)
VALUES ('kend-007','Isuzu Elf Long 2022','Isuzu','Elf NLR 55 Long',2022,'H 1007 MN','MICROBUS','MT','Solar',16,1400000,0,'TERSEDIA');

COMMIT;
-- Setelah ini, generate hash bcrypt via Python dan UPDATE tabel KARYAWAN.
-- ==============================================================================