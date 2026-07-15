    DROP TABLE IF EXISTS PENGELUARAN_OPERASIONAL CASCADE;
    DROP TABLE IF EXISTS TRANSAKSI_SEWA CASCADE;
    DROP TABLE IF EXISTS KENDARAAN CASCADE;
    DROP TABLE IF EXISTS PELANGGAN CASCADE;
    DROP TABLE IF EXISTS KARYAWAN CASCADE;
    CREATE TABLE KARYAWAN (
        id_karyawan       VARCHAR(50)     NOT NULL PRIMARY KEY,
        nama_lengkap      VARCHAR(100)    NOT NULL,
        email             VARCHAR(100)    NOT NULL UNIQUE,
        no_telepon        VARCHAR(25),
        password_hash     VARCHAR(255)    NOT NULL,
        role              VARCHAR(20)     NOT NULL CHECK (role IN ('OWNER','KASIR','SUPIR')),
        is_aktif          TINYINT(1)      DEFAULT 1 NOT NULL,
        foto_profil_url   VARCHAR(500),
        tanggal_masuk     DATETIME        DEFAULT CURRENT_TIMESTAMP NOT NULL,
        gaji_per_bulan    DECIMAL(12,2)   DEFAULT 0,
        created_at        TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at        TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    ) COMMENT='Master data karyawan — dasar RBAC sistem. UUID v4.';
    CREATE TABLE KENDARAAN (
        id_kendaraan          VARCHAR(50)     NOT NULL PRIMARY KEY,
        nama_kendaraan        VARCHAR(100)    NOT NULL,
        merk                  VARCHAR(50)     NOT NULL,
        model                 VARCHAR(60),
        tahun                 INT             NOT NULL,
        nomor_plat            VARCHAR(15)     NOT NULL UNIQUE,
        tipe_kendaraan        VARCHAR(20)     NOT NULL CHECK (tipe_kendaraan IN ('5_SEATER','7_SEATER','MICROBUS')),
        transmisi             VARCHAR(10)     DEFAULT 'AT' NOT NULL CHECK (transmisi IN ('AT','MT')),
        bahan_bakar           VARCHAR(15)     DEFAULT 'Bensin' NOT NULL CHECK (bahan_bakar IN ('Bensin','Solar','Hybrid','Listrik')),
        kapasitas_penumpang   INT,
        harga_sewa_harian     DECIMAL(12,2)   NOT NULL CHECK (harga_sewa_harian > 0),
        harga_supir_harian    DECIMAL(12,2)   DEFAULT 150000 NOT NULL,
        status                VARCHAR(20)     DEFAULT 'TERSEDIA' NOT NULL CHECK (status IN ('TERSEDIA','DISEWA','PERAWATAN')),
        foto_url              VARCHAR(500),
        deskripsi             TEXT,
        is_featured           TINYINT(1)      DEFAULT 0 NOT NULL,
        traccar_device_id     VARCHAR(50),
        odometer_km           INT             DEFAULT 0,
        created_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    ) COMMENT='Master inventaris armada kendaraan';
    CREATE TABLE PELANGGAN (
        id_pelanggan      VARCHAR(50)     NOT NULL PRIMARY KEY,
        nama_lengkap      VARCHAR(100)    NOT NULL,
        email             VARCHAR(100),
        password_hash     VARCHAR(255),
        no_telepon        VARCHAR(25)     NOT NULL,
        alamat            TEXT,
        no_ktp            VARCHAR(25),
        foto_ktp_url      VARCHAR(500),
        foto_sim_url      VARCHAR(500),
        is_verified       TINYINT(1)      DEFAULT 0 NOT NULL,
        created_at        TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at        TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
    ) COMMENT='Data penyewa kendaraan AeroRent';
    CREATE TABLE TRANSAKSI_SEWA (
        id_transaksi              VARCHAR(50)     NOT NULL PRIMARY KEY,
        nomor_booking             VARCHAR(20)     NOT NULL UNIQUE, 
        id_pelanggan              VARCHAR(50)     NOT NULL,
        id_kendaraan              VARCHAR(50)     NOT NULL,
        id_karyawan_kasir         VARCHAR(50),                     
        id_supir                  VARCHAR(50),                     

        tanggal_mulai             DATE            NOT NULL,
        tanggal_selesai_rencana   DATE            NOT NULL,
        tanggal_selesai_aktual    DATETIME,                        
        durasi_hari_rencana       INT             NOT NULL,

        gunakan_supir             TINYINT(1)      DEFAULT 0 NOT NULL,

        biaya_sewa                DECIMAL(12,2)   NOT NULL,
        biaya_supir               DECIMAL(12,2)   DEFAULT 0 NOT NULL,
        biaya_denda_terlambat     DECIMAL(12,2)   DEFAULT 0 NOT NULL,
        biaya_denda_kerusakan     DECIMAL(12,2)   DEFAULT 0 NOT NULL,
        biaya_tambahan_lain       DECIMAL(12,2)   DEFAULT 0 NOT NULL,
        total_biaya               DECIMAL(12,2)   NOT NULL,

        metode_pembayaran         VARCHAR(30),
        midtrans_order_id         VARCHAR(100),
        midtrans_transaction_id   VARCHAR(100),
        midtrans_status           VARCHAR(50),
        status_pembayaran         VARCHAR(20)     DEFAULT 'BELUM_LUNAS' NOT NULL CHECK (status_pembayaran IN ('BELUM_LUNAS','DP','LUNAS')),

        status                    VARCHAR(25)     DEFAULT 'MENUNGGU' NOT NULL CHECK (status IN ('MENUNGGU','DIKONFIRMASI','AKTIF','SELESAI','DIBATALKAN')),
        foto_kondisi_sebelum      TEXT,                            
        foto_kondisi_sesudah      TEXT,                            
        catatan_kerusakan         TEXT,
        catatan_kasir             TEXT,

        created_at                TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at                TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

        FOREIGN KEY (id_pelanggan)      REFERENCES PELANGGAN(id_pelanggan) ON DELETE RESTRICT,
        FOREIGN KEY (id_kendaraan)      REFERENCES KENDARAAN(id_kendaraan) ON DELETE RESTRICT,
        FOREIGN KEY (id_karyawan_kasir) REFERENCES KARYAWAN(id_karyawan) ON DELETE SET NULL,
        FOREIGN KEY (id_supir)          REFERENCES KARYAWAN(id_karyawan) ON DELETE SET NULL
    ) COMMENT='Inti sistem: siklus hidup lengkap transaksi sewa';
    CREATE TABLE PENGELUARAN_OPERASIONAL (
        id_pengeluaran        VARCHAR(50)     NOT NULL PRIMARY KEY,
        nomor_pengeluaran     VARCHAR(20),                             
        id_karyawan           VARCHAR(50)     NOT NULL,
        id_kendaraan          VARCHAR(50),
        kategori              VARCHAR(50)     NOT NULL CHECK (kategori IN ('PERAWATAN','SERVIS','BBM','ASURANSI','PAJAK','GAJI','OPERASIONAL','LAINNYA')),
        deskripsi             VARCHAR(500)    NOT NULL,
        jumlah                DECIMAL(12,2)   NOT NULL CHECK (jumlah > 0),
        tanggal_pengeluaran   DATE            NOT NULL,
        bukti_url             VARCHAR(500),
        catatan               TEXT,
        created_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

        FOREIGN KEY (id_karyawan)  REFERENCES KARYAWAN(id_karyawan) ON DELETE RESTRICT,
        FOREIGN KEY (id_kendaraan) REFERENCES KENDARAAN(id_kendaraan) ON DELETE SET NULL
    ) COMMENT='Pengeluaran operasional bisnis';
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
    INSERT INTO KARYAWAN (id_karyawan, nama_lengkap, email, no_telepon, password_hash, role, gaji_per_bulan) VALUES 
    ('k-owner-001','Bapak Owner','owner@aerorent.id','+628123456789','$2b$12$K1rZgD9sI/8W4P9d6C.K8uS/9Z5H1c9z9/D9/8Z9/8Z9/8Z9/8Z9.','OWNER',5000000),
    ('k-kasir-001','Admin Kasir','kasir@aerorent.id','+628987654321','$2b$12$K1rZgD9sI/8W4P9d6C.K8uS/9Z5H1c9z9/D9/8Z9/8Z9/8Z9/8Z9.','KASIR',3000000);

    INSERT INTO KENDARAAN (id_kendaraan, nama_kendaraan, merk, model, tahun, nomor_plat, tipe_kendaraan, transmisi, bahan_bakar, kapasitas_penumpang, harga_sewa_harian, is_featured, status) VALUES 
    ('kend-001','Honda Brio RS 2023','Honda','Brio RS',2023,'H 1001 AB','5_SEATER','AT','Bensin',5,300000,1,'TERSEDIA'),
    ('kend-002','Honda CR-V 2022','Honda','CR-V 1.5T',2022,'H 1002 CD','5_SEATER','AT','Bensin',5,650000,0,'TERSEDIA'),
    ('kend-003','Toyota Avanza 2022','Toyota','Avanza 1.3G',2022,'H 1003 EF','7_SEATER','MT','Bensin',7,350000,0,'TERSEDIA'),
    ('kend-004','Toyota Innova Reborn 2023','Toyota','Kijang Innova Reborn 2.0G',2023,'H 1004 GH','7_SEATER','AT','Bensin',7,750000,1,'DISEWA'),
    ('kend-005','Mitsubishi Pajero Sport 2022','Mitsubishi','Pajero Sport Dakar',2022,'H 1005 IJ','7_SEATER','AT','Solar',7,950000,1,'TERSEDIA'),
    ('kend-006','Toyota Hiace Commuter 2023','Toyota','Hiace Commuter 3.0',2023,'H 1006 KL','MICROBUS','MT','Solar',14,1200000,0,'TERSEDIA'),
    ('kend-007','Isuzu Elf Long 2022','Isuzu','Elf NLR 55 Long',2022,'H 1007 MN','MICROBUS','MT','Solar',16,1400000,0,'TERSEDIA');