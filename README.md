# 🗳️ Sistema de Gestión Geográfica

Aplicación MVC para gestión de información geográfica y electoral en Medellín.
Sincronización bidireccional entre mapa interactivo y Excel.

---

## 🏗️ Arquitectura

```
/Sistema-Gestion-Geografica-main
├── /backend
│   ├── server.js              ← Punto de entrada Express
│   ├── /config
│   │   └── db.js              ← Conexión PostgreSQL + PostGIS
│   ├── /controllers
│   │   ├── personaController.js
│   │   └── excelController.js
│   ├── /models
│   │   ├── Persona.js         ← CRUD + operaciones PostGIS
│   │   └── Cuadrante.js       ← Polígonos + ST_Contains
│   ├── /routes
│   │   ├── personaRoutes.js
│   │   ├── cuadranteRoutes.js
│   │   ├── excelRoutes.js
│   │   ├── geocodingRoutes.js
│   │   └── estadisticasRoutes.js
│   └── /services
│       ├── excelService.js    ← Importar/exportar SheetJS
│       └── geocodingService.js← Nominatim + caché
├── /frontend
│   ├── /src
│   │   ├── App.jsx            ← Estado global + navegación
│   │   ├── /components
│   │   │   ├── MapView.jsx    ← Leaflet + cuadrantes + pines
│   │   │   ├── PersonaTable.jsx
│   │   │   ├── StatsPanel.jsx
│   │   │   └── ExcelPanel.jsx
│   │   ├── /forms
│   │   │   └── PersonaForm.jsx← Crear/editar con geocodificación
│   │   └── /utils
│   │       └── api.js         ← Cliente axios
│   └── vite.config.js
└── /database
    ├── schema.sql             ← PostGIS + triggers + vistas
    └── init.js                ← Script de inicialización
```

---

## ⚙️ Requisitos previos

- **Node.js** v18+
- **PostgreSQL** 14+ con extensión **PostGIS** 3+
- **npm** o **yarn**

### Instalar PostGIS en PostgreSQL

```bash
# Ubuntu/Debian
sudo apt install postgresql-14-postgis-3

# macOS (Homebrew)
brew install postgis

# En psql como superusuario
CREATE EXTENSION IF NOT EXISTS postgis;
```

---

## 🚀 Instalación paso a paso

### 1. Clonar y configurar

```bash
git clone <repo>
cd medellin-electoral
```

### 2. Crear la base de datos

```bash
psql -U postgres -c "CREATE DATABASE medellin_electoral;"
```

### 3. Configurar variables de entorno

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL
```

### 4. Inicializar el esquema

```bash
cd database

npm init -y
npm install dotenv pg

node init.js
# Esto crea todas las tablas, índices PostGIS, triggers y datos iniciales
```

### 5. Instalar dependencias del backend

```bash
cd backend
npm install
npm run dev  # Puerto 3000
```

### 6. Instalar dependencias del frontend

```bash
cd frontend
npm install
npm run dev  # Puerto 5173
```

### 7. Abrir la aplicación

```
http://localhost:5173
```

---

## 📋 API Endpoints

### Personas (pines del mapa)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/personas` | Listar con filtros |
| GET    | `/api/personas/geojson` | GeoJSON para Leaflet |
| POST   | `/api/personas` | Crear persona + pin |
| PUT    | `/api/personas/:id` | Actualizar |
| DELETE | `/api/personas/:id` | Eliminar |

### Cuadrantes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/cuadrantes` | GeoJSON de cuadrantes |
| POST   | `/api/cuadrantes` | Crear cuadrante |
| GET    | `/api/cuadrantes/detectar?lat=&lon=` | Detectar cuadrante para un punto |

### Excel
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST   | `/api/excel/importar` | Subir .xlsx → crear pines |
| GET    | `/api/excel/exportar` | Descargar Excel |
| GET    | `/api/excel/plantilla` | Descargar plantilla vacía |

### Estadísticas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/estadisticas` | Resumen general |
| GET    | `/api/estadisticas/por-comuna` | Por comuna |
| GET    | `/api/estadisticas/por-barrio` | Por barrio |
| GET    | `/api/estadisticas/por-cuadrante` | Por cuadrante |

### Geocodificación
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/geocodificar?direccion=&barrio=` | Dirección → coordenadas |
| GET    | `/api/geocodificar/inverso?lat=&lon=` | Coordenadas → dirección |

---

## 🔁 Flujo bidireccional

### Mapa → Excel
1. Haz click en el mapa en un punto vacío
2. Se abre el formulario con lat/lon pre-llenados
3. Completa los datos y guarda
4. El pin aparece en el mapa inmediatamente
5. Ve a "Excel" → "Exportar" para descargar el archivo actualizado

### Excel → Mapa
1. Descarga la plantilla desde "Excel" → "Descargar plantilla"
2. Llena los datos (la dirección es suficiente, lat/lon son opcionales)
3. Sube el archivo en "Excel" → "Importar"
4. El sistema geocodifica las direcciones automáticamente
5. Los pines aparecen en el mapa

---

## 🗺️ Agregar cuadrantes reales

Para cargar los cuadrantes reales de Medellín desde GeoJSON oficial:

```bash
# Usando el endpoint de la API
curl -X POST http://localhost:3000/api/cuadrantes \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Popular Norte-Oeste",
    "codigo": "POP-NW",
    "comuna": "Popular",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[-75.54,6.30],[-75.52,6.30],[-75.52,6.32],[-75.54,6.32],[-75.54,6.30]]]
    }
  }'
```

O importar directamente un archivo GeoJSON de Medellín con `ogr2ogr`:

```bash
ogr2ogr -f "PostgreSQL" PG:"host=localhost dbname=medellin_electoral user=postgres" \
  comunas_medellin.geojson -nln cuadrantes -t_srs EPSG:4326
```

---

## 🐛 Troubleshooting

**PostGIS no encontrado:**
```sql
-- Conectarse como superusuario a la BD
\c medellin_electoral
CREATE EXTENSION postgis;
```
---
