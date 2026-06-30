import pymysql
from config import cfg

def run():
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
        print("Checking if foto_profil_url column exists...")
        cur.execute("SHOW COLUMNS FROM PELANGGAN LIKE 'foto_profil_url'")
        row = cur.fetchone()
        if row:
            print("Column foto_profil_url already exists.")
        else:
            print("Adding foto_profil_url column...")
            cur.execute("ALTER TABLE PELANGGAN ADD COLUMN foto_profil_url VARCHAR(255) NULL AFTER no_ktp")
            print("Column added successfully.")
    
    conn.close()
    print("Done.")

if __name__ == "__main__":
    run()
