import pymysql
from config import cfg

def main():
    print("Menghubungkan ke database...")
    conn = pymysql.connect(
        host=cfg.DB_HOST,
        port=cfg.DB_PORT,
        user=cfg.DB_USER,
        password=cfg.DB_PASSWORD,
        database=cfg.DB_NAME,
        autocommit=True,
        ssl={"ssl": True}
    )
    cur = conn.cursor()
    
    try:
        # Update status verifikasi
        cur.execute("UPDATE PELANGGAN SET is_verified = 1 WHERE email = 'awillyam327@gmail.com'")
        print("✅ Akun awillyam327@gmail.com telah diset sebagai terverifikasi.")
        
        # Hapus akun pelanggan yang lain
        cur.execute("DELETE FROM PELANGGAN WHERE email != 'awillyam327@gmail.com'")
        print("✅ Semua akun pelanggan selain awillyam327@gmail.com telah dibersihkan.")
        
    except Exception as e:
        print(f"Terjadi kesalahan: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
