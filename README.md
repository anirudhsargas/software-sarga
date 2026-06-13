# Sarga - Software Management System

A full-stack business management system for printing shops, built with React, Node.js, and MySQL.

## Project Structure

```
software-sarga/
├── client/          # React frontend (Vite + React 19)
├── server/          # Node.js backend (Express + MySQL)
├── ml-service/      # Python ML service for expense categorization
├── migrations/      # Database migration files
├── tools/           # Utility scripts
└── docs/            # Historical documentation (archived)
```

## Tech Stack

### Frontend
- React 19.2.0
- Vite 6.0.11
- React Router DOM 7.13.0
- Lucide React (icons)
- Recharts (charts)
- HTML5-QRCode (QR scanning)
- jsPDF (PDF generation)

### Backend
- Node.js + Express 5.2.1
- MySQL 2 (mysql2)
- JWT authentication
- Multer (file uploads)
- Winston (logging)
- Node-cache (response caching)

### ML Service
- Python Flask
- scikit-learn (TF-IDF, Naive Bayes)
- Joblib (model persistence)

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.8+
- MySQL 8.0+

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd software-sarga
```

2. Install dependencies
```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..

# Install server dependencies
cd server
npm install
cd ..

# Install ML service dependencies
cd ml-service
pip install -r requirements.txt
cd ..
```

3. Configure environment variables
- Copy `server/.env.example` to `server/.env`
- Copy `client/.env.example` to `client/.env.development`
- Update with your database credentials and API keys

4. Initialize database
```bash
cd server
node -e "require('./database').initDb()"
```

5. Start the services
```bash
# Start server (port 5000)
cd server
node index.js

# Start client (port 5173)
cd client
npm run dev

# Start ML service (port 5001)
cd ml-service
python app.py
```

## Features

- **Job Management**: Track printing jobs from order to delivery
- **Customer Management**: Customer database with payment tracking
- **Inventory Management**: Paper, consumables, and equipment tracking
- **Staff Management**: Employee management with attendance and salary
- **Vendor Management**: Supplier tracking with invoice management
- **Expense Tracking**: Automated expense categorization using ML
- **QR Code Support**: QR-based job tracking and scanning
- **Offline Support**: PWA with offline-first architecture
- **Multi-branch**: Support for multiple branch locations

## API Documentation

API endpoints follow RESTful conventions:
- Authentication required for all endpoints (except login)
- Role-based access control (Admin, Accountant, Printer, Front Office, etc.)
- Rate limiting and CORS protection enabled
- Response caching for static data endpoints

## Performance Optimizations

- Database indexes on frequently queried columns
- Response caching with NodeCache
- Pagination for large result sets
- Code splitting and lazy loading in frontend
- Image compression for uploads
- Optimized queries (no SELECT *)

## Security

- JWT authentication with secret rotation support
- Password hashing with bcryptjs
- CORS protection
- Helmet security headers
- Rate limiting
- XSS prevention with DOMPurify
- Input validation with Zod

## Deployment

See deployment scripts in the root directory:
- `deploy.ps1` - PowerShell deployment script
- `start.ps1` - Start all services
- `start.js` - Node.js startup script

## Documentation

Historical documentation has been archived to the `docs/` folder. See `docs/README.md` for an index of archived documentation.

## License

Proprietary - All rights reserved
