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
    
    emails_to_delete = [
        'arthurwillyamliang@gmail.com',
        'williamliangarthur@gmail.com',
        '682024046@gmail.com'
    ]
    
    try:
        format_strings = ','.join(['%s'] * len(emails_to_delete))
        query = f"DELETE FROM PELANGGAN WHERE email IN ({format_strings})"
        
        cur.execute(query, tuple(emails_to_delete))
        print(f"Berhasil menghapus {cur.rowcount} baris/akun dengan email tersebut.")
        
    except Exception as e:
        print(f"Terjadi kesalahan saat menghapus data: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
