<div align="center">
  <h1>🚗 AeroRent Salatiga</h1>
  <p><em>Modern, AI-Powered Car Rental Management System</em></p>

  [![Python](https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
  [![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
  [![TiDB](https://img.shields.io/badge/TiDB_Cloud-3B5998?style=for-the-badge&logo=tidb&logoColor=white)](https://en.pingcap.com/tidb-cloud/)
  [![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
</div>

<br/>

AeroRent is a modern, full-stack enterprise resource planning (ERP) system tailored for car rental businesses. It features a decoupled serverless architecture, ensuring zero idle server costs, blazing-fast performance, and high scalability.

### 🔗 **Live Demo:** [https://aero-rent.vercel.app](https://aero-rent.vercel.app)

---

## ✨ Key Features & Innovations

1. 🤖 **AI-Powered Security (Face++):** Prevents identity theft during self-drive bookings by requiring a mandatory *Liveness Detection Selfie*. The AI verifies if the user is real and matches their face against their ID card in real-time.
2. 💸 **Automated Payments (Midtrans):** Fully integrated with Midtrans Payment Gateway (QRIS & Virtual Accounts) via 512-bit HMAC secure webhooks. Zero manual payment verification needed.
3. 📱 **Smart Notifications (Fonnte):** Automatically sends WhatsApp reminders to customers 24 hours before their rental period expires.
4. 📸 **Digital Handover Inspection:** Requires cashiers to upload 5 mandatory vehicle condition photos before handing over the keys, preventing damage disputes.
5. 📊 **Owner Business Intelligence:** Real-time financial dashboards and one-click PDF Profit & Loss report generation using `ReportLab`.

---

## 🚀 Tech Stack

### Backend
* **Framework:** FastAPI (Python 3.10+)
* **Database:** TiDB Cloud (MySQL compatible, Distributed SQL)
* **ORM / Connector:** `aiomysql` (Asynchronous Database Connection)
* **Authentication:** JWT (JSON Web Tokens) with PBKDF2 Hashing
* **PDF Generation:** ReportLab
* **Third-Party APIs:** Midtrans, ImgBB, Face++, Fonnte

### Frontend
* **Core:** Vanilla JavaScript (ES6+), HTML5, CSS3
* **Icons:** Phosphor Icons
* **Architecture:** Component-based vanilla DOM manipulation with a centralized API fetch wrapper.

---

## 📁 Project Structure

```text
AeroRent/
├── backend/
│   ├── main.py          # FastAPI application entry point
│   ├── database.py      # TiDB connection pool setup
│   ├── models.py        # Pydantic schemas for data validation
│   ├── dependencies.py  # Security, JWT, and RBAC injection
│   ├── utils.py         # Helper functions (PDF, Email, Scheduler)
│   └── routers/         # API Endpoints (Auth, Transaksi, Kendaraan, dll)
├── frontend/
│   ├── index.html       # Landing Page
│   ├── css/             # Global & Scoped Stylesheets
│   ├── js/              # Client-side Logic (API Client, Auth, UI State)
│   └── pages/           # Customer & Admin Dashboard Pages
└── database/
    └── schema.sql       # Database DDL & Initial Seed Data
```

---

## ⚙️ Local Development Setup

### 1. Database Setup
1. Create a TiDB Cloud database.
2. Execute the queries inside `database/schema.sql` to generate the required tables and seed data.

### 2. Backend Setup
```bash
# 1. Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# 2. Install dependencies
pip install fastapi uvicorn aiomysql pydantic python-multipart pyjwt passlib bcrypt httpx aiosmtplib reportlab apscheduler

# 3. Configure Environment Variables (.env)
# DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
# JWT_SECRET, MIDTRANS_SERVER_KEY, IMGBB_API_KEY, FONNTE_TOKEN, FACEPLUS_API_KEY, FACEPLUS_API_SECRET

# 4. Run the server
cd backend
uvicorn main:app --reload
```

### 3. Frontend Setup
Since the frontend is built using Vanilla JS, no `npm install` or build step is required.
Simply serve the `frontend` directory using any local web server:
```bash
# Using Python HTTP Server
cd frontend
python -m http.server 5500
```

---

## 🔒 Security Summary
* **Role-Based Access Control (RBAC):** Distinct roles for Owner, Kasir, and Customer.
* **SQL Injection Prevention:** Strict usage of parameterized queries via `aiomysql`.
* **Cross-Site Scripting (XSS) Mitigation:** Safe DOM manipulation implemented across the frontend.
