# VisitaDoctores - Sistema de Gestión Médica

Sistema web dockerizado para gestión de visita médica e inventarios.

## 🚀 Inicio Rápido con Docker

```bash
# 1. Clonar o descargar el proyecto
# 2. Iniciar con Docker Compose:
docker-compose up -d --build

# 3. Abrir en el navegador:
# http://localhost:3000
```

## 📁 Estructura del Proyecto

```
VisitaDoctores/
├── docker-compose.yml      # Orquestación de servicios
├── Dockerfile              # Multi-stage build
├── .env                    # Variables de entorno
├── db/
│   └── init.sql            # Esquema SQL (4 tablas)
├── server/                 # Backend (Node.js/Express)
│   ├── index.js            # Entry point
│   ├── db.js               # Pool PostgreSQL
│   ├── parser.js           # Parser regex para TXT
│   ├── parser.test.js      # Unit tests del parser
│   └── routes/
│       ├── doctors.js      # CRUD Doctores
│       ├── products.js     # CRUD Productos
│       ├── inventory.js    # Stock + alertas críticas
│       └── sales.js        # Historial + upload TXT
├── client/                 # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.jsx         # Layout + routing
│   │   ├── api.js          # Cliente API
│   │   ├── index.css       # Design system
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── Doctors.jsx
│   │       ├── Products.jsx
│   │       ├── Inventory.jsx
│   │       ├── Upload.jsx
│   │       ├── Sales.jsx
│   │       └── Alerts.jsx
│   └── vite.config.js
└── sample_ticket.txt       # Ejemplo de ticket
```

## 🔧 Desarrollo Local (sin Docker)

```bash
# Backend
cd server && npm install && npm run dev

# Frontend (otra terminal)
cd client && npm install && npm run dev
```

## 📋 API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/dashboard` | Estadísticas generales |
| GET/POST/PUT/DELETE | `/api/doctors` | CRUD Doctores |
| GET/POST/PUT/DELETE | `/api/products` | CRUD Productos |
| GET/POST/PUT/DELETE | `/api/inventory` | Gestión de stock |
| GET | `/api/inventory/critical` | Alertas de stock bajo |
| GET | `/api/sales` | Historial de ventas |
| POST | `/api/sales/upload` | Subir y procesar TXT |
| POST | `/api/sales/parse-preview` | Vista previa sin guardar |

## 🏥 Formato de Ticket TXT

```
DR ADOLFO MTZ TAPIA
FARMAPRAM 0.50 MG
1 Pza
2026-03-11
```
