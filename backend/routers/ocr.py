from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import httpx
from config import cfg

router = APIRouter(prefix="/ocr", tags=["OCR"])

@router.post("/ktp", tags=["📷 OCR"])
async def ocr_ktp(file: UploadFile = File(...)):
    if not cfg.OCR_SPACE_API_KEY:
        raise HTTPException(500, "Kunci API OCR.space belum dikonfigurasi di backend.")

    content = await file.read()
    
    # OCR.space API endpoint
    # Note: KTP language is Indonesian (ind) or English (eng)
    data = {
        "apikey": cfg.OCR_SPACE_API_KEY,
        "language": "eng", # "ind" may not be available on free tier, eng works fine for numbers/names
        "isOverlayRequired": False,
        "OCREngine": 2
    }
    
    files = {"file": (file.filename, content, file.content_type)}

    async with httpx.AsyncClient() as client:
        try:
            r = await client.post("https://api.ocr.space/parse/image", data=data, files=files, timeout=30.0)
            r.raise_for_status()
            res = r.json()
            
            if res.get("IsErroredOnProcessing"):
                raise HTTPException(500, f"OCR Error: {res.get('ErrorMessage')}")
                
            parsed_results = res.get("ParsedResults", [])
            if not parsed_results:
                raise HTTPException(400, "Tidak ada teks yang terdeteksi.")
                
            raw_text = parsed_results[0].get("ParsedText", "")
            
            # Simple Regex for Indonesian KTP
            import re
            
            nik = ""
            nama = ""
            alamat = ""
            
            # Find NIK (16 digits)
            nik_match = re.search(r'\b\d{16}\b', raw_text)
            if nik_match:
                nik = nik_match.group(0)
            
            # Find Nama
            # Look for "Nama" or "Narna" followed by anything, capture the rest of the line
            nama_match = re.search(r'(?i)Nama\s*[:;]?\s*(.+)', raw_text)
            if nama_match:
                nama = nama_match.group(1).strip()
            
            # Find Alamat
            alamat_match = re.search(r'(?i)Alamat\s*[:;]?\s*(.+)', raw_text)
            if alamat_match:
                alamat = alamat_match.group(1).strip()
                
            return {
                "text": raw_text,
                "nik": nik,
                "nama": nama,
                "alamat": alamat
            }
            
        except httpx.RequestError as e:
            raise HTTPException(503, f"Gagal menghubungi layanan OCR: {str(e)}")
