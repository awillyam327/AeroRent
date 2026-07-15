# AeroRent Salatiga - Car Rental System 🚗

AeroRent is a modern, full-stack car rental management system designed for speed, security, and scalability. It features a completely decoupled architecture using a Python FastAPI backend and a Vanilla JavaScript frontend.

## 🚀 Tech Stack

### Backend
* **Framework:** FastAPI (Python 3.10+)
* **Database:** TiDB Cloud (MySQL compatible)
* **ORM / Connector:** `aiomysql` (Asynchronous Database Connection)
* **Authentication:** JWT (JSON Web Tokens) with PBKDF2 Hashing
* **PDF Generation:** ReportLab
* **Third-Party APIs:**
  * **Midtrans:** Payment Gateway (QRIS, Virtual Accounts)
  * **ImgBB:** Image hosting and CDN
  * **Face++:** Liveness detection & facial matching for ID verification
  * **Fonnte:** WhatsApp Gateway for notifications

### Frontend
* **Core:** Vanilla JavaScript (ES6+), HTML5, CSS3
* **Icons:** Phosphor Icons
* **Architecture:** Component-based vanilla DOM manipulation with a centralized API fetch wrapper.

## 📁 Project Structure

```text
AeroRent/
├── backend/
│   ├── main.py          # FastAPI application entry point
│   ├── config.py        # Environment variables & constants
│   ├── database.py      # TiDB connection pool setup
│   ├── models.py        # Pydantic schemas for data validation
│   ├── dependencies.py  # Security, JWT, and RBAC injection
│   ├── utils.py         # Helper functions (PDF, Email, Scheduler)
│   └── routers/         # API Endpoints (Auth, Transaksi, Kendaraan, dll)
├── frontend/
│   ├── index.html       # Landing Page
│   ├── css/             # Global & Scoped Stylesheets
│   ├── js/              # Client-side Logic (API Client, Auth, UI State)
│   ├── assets/          # Static assets (Images)
│   └── pages/           # Customer & Admin Dashboard Pages
├── database/
│   └── schema.sql       # Database DDL & Initial Seed Data
└── README.md
```

## ⚙️ Installation & Setup

### 1. Database Setup
1. Create a TiDB Cloud database.
2. Execute the queries inside `database/schema.sql` to generate the required tables and seed data (Owner & Cashier accounts).

### 2. Backend Setup
1. Navigate to the root directory and create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn aiomysql pydantic python-multipart pyjwt passlib bcrypt httpx aiosmtplib reportlab apscheduler
   ```
3. Set up Environment Variables (or create a `.env` file):
   * `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   * `JWT_SECRET`, `MIDTRANS_SERVER_KEY`, `IMGBB_API_KEY`, `FONNTE_TOKEN`
4. Run the development server:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

### 3. Frontend Setup
Since the frontend is built using Vanilla JS, no `npm install` or build step is required!
Simply open `frontend/index.html` using a local web server, for example:
* **VS Code Live Server Extension**
* **Python HTTP Server:** `python -m http.server 5500`

## 🔒 Security Features
* **Role-Based Access Control (RBAC):** Distinct roles for Owner, Kasir, and Customer.
* **SQL Injection Prevention:** Parameterized queries via `aiomysql`.
* **Cross-Site Scripting (XSS) Mitigation:** Strict DOM escaping implemented across the frontend.
* **Webhook Signature Validation:** HMAC 512-bit verification for Midtrans payments.
