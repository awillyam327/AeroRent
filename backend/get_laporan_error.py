import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as c:
        r1 = await c.post('http://127.0.0.1:8000/auth/login', data={'username':'owner@aerorent.id', 'password':'OwnerAeroRent2026'})
        token = r1.json()['access_token']
        r2 = await c.get('http://127.0.0.1:8000/laporan/keuangan?dari=2026-06-01&sampai=2026-06-25', headers={'Authorization': 'Bearer '+token})
        print(r2.text)

if __name__ == '__main__':
    asyncio.run(main())
