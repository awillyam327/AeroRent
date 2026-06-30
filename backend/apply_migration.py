import pymysql
from config import cfg

def main():
    print("Connecting to DB (sync)...")
    conn = pymysql.connect(
        host=cfg.DB_HOST,
        port=cfg.DB_PORT,
        user=cfg.DB_USER,
        password=cfg.DB_PASSWORD,
        database=cfg.DB_NAME,
        ssl={"ssl": True},
        autocommit=True
    )
    with conn.cursor() as cur:
        try:
            print("Adding id_supir to TRANSAKSI_SEWA...")
            cur.execute("ALTER TABLE TRANSAKSI_SEWA ADD COLUMN id_supir VARCHAR(50);")
            print("Added column id_supir.")
        except Exception as e:
            print(f"Error adding column: {e}")
            
        try:
            cur.execute("ALTER TABLE TRANSAKSI_SEWA ADD CONSTRAINT fk_trx_supir FOREIGN KEY (id_supir) REFERENCES KARYAWAN(id_karyawan) ON DELETE SET NULL;")
            print("Added foreign key constraint.")
        except Exception as e:
            print(f"Error adding foreign key: {e}")

        try:
            cur.execute("ALTER TABLE KENDARAAN ADD COLUMN id_karyawan VARCHAR(50);")
            print("Added id_karyawan to KENDARAAN.")
            cur.execute("ALTER TABLE KENDARAAN ADD CONSTRAINT fk_kend_karyawan FOREIGN KEY (id_karyawan) REFERENCES KARYAWAN(id_karyawan) ON DELETE SET NULL;")
            print("Added fk to KENDARAAN.")
        except Exception as e:
            print(f"Error adding id_karyawan: {e}")
            
    conn.close()

if __name__ == "__main__":
    main()
