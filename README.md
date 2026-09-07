# 🚀 Open-DownMedia

> **Descargador Universal de Medios de Redes Sociales Sin Marca de Agua**  
> Proyecto Open Source de alto rendimiento desarrollado por **Carlos González (Mr. Monterrosa)**.  
> Diseñado bajo la estética **Modern Dark Bento-Grid** y el sistema de diseño **Material 3 You / Brand Amber**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-v22+-red.svg)](https://angular.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

---

## 🌟 Características Principales

* 🎯 **Sin Marcas de Agua:** Extrae el stream original en alta definición (HD) directamente desde los servidores CDN de TikTok y Reels antes de que se incruste la marca de agua.
* 🎧 **Extracción de Audio MP3:** Convierte videos musicales, podcasts o trends a archivos de audio independientes en alta calidad.
* 📱 **Compatibilidad Multi-Plataforma:** Soporte optimizado para:
  * **TikTok** (Video sin marca de agua, audios originales)
  * **Instagram** (Reels, publicaciones de video y fotos)
  * **YouTube** (Videos HD/4K y extracción de audio)
  * **X / Twitter** (Videos en máxima resolución)
  * **Facebook & Reddit** (Videos con audio sincronizado)
  * **Pinterest** (Pines de video e imágenes)
* 🛡️ **Seguridad Reforzada:**
  * **Protección Anti-SSRF:** Filtrado estricto contra peticiones a redes internas y localhost.
  * **Prevención de Inyección de Comandos:** Argumentos procesados de forma segura sin interpolación en shells.
  * **Rate Limiting:** Control de saturación y abuso con `express-rate-limit`.
  * **Cabeceras Seguras:** Configuración con `helmet` (CSP, HSTS, X-Content-Type-Options).
* 📈 **SEO de Alto Nivel:**
  * Datos estructurados Schema.org (`WebApplication` y `FAQPage` en JSON-LD).
  * Etiquetas OpenGraph completas y Twitter Cards.
  * Código semántico accesible y `sitemap.xml` / `robots.txt` incluidos.
* 🐳 **Docker & Docker Compose:** Despliegue en un solo comando con Nginx proxy inverso y streaming directo sin consumo excesivo de RAM.

---

## 📐 Identidad Visual y Sistema de Diseño

El proyecto implementa la guía de estilo oficial de [BRAND_IDENTITY.md]:
* **Brand Primary:** `#facc15` (Brand Amber)
* **Dark Theme:** `#121316` (Page BG), `#18191e` (Bento Box), `#1d1e24` (Sub-cards)
* **Bordes Bento:** `rounded-[28px]` con iluminación ambiental difusa (*glow blur*).
* **Tipografía:** Inter / System UI con características OpenType (`cv02`, `cv03`, `cv04`, `cv11`).

---

## 📂 Estructura del Proyecto

```
open-down-media/
├── backend/                  # API REST en Node.js + TypeScript
│   ├── src/
│   │   ├── controllers/      # Controladores de medios y salud
│   │   ├── services/         # Servicio yt-dlp-wrap y FFmpeg
│   │   ├── middleware/       # Seguridad (Anti-SSRF, Rate Limiting)
│   │   └── index.ts          # Servidor Express
│   ├── Dockerfile            # Imagen Alpine con Python3, FFmpeg y yt-dlp
│   └── package.json
├── frontend/                 # Interfaz de Usuario en Angular
│   ├── src/
│   │   ├── app/              # Componentes con Signals y Bento Grid
│   │   ├── assets/           # Iconos y recursos estáticos
│   │   └── index.html        # Metadatos SEO y Schema.org JSON-LD
│   ├── tailwind.config.js    # Tokens de Brand Amber y Bento Box
│   ├── nginx.conf            # Proxy inverso y streaming
│   ├── Dockerfile            # Multi-stage build (Angular + Nginx Alpine)
│   └── package.json
├── docker-compose.yml        # Orquestación de servicios
├── package.json              # Scripts de automatización raíz
└── README.md
```

---

## 🚀 Puesta en Marcha Rápida

### Opción 1: Con Docker Compose (Recomendado para Producción)

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/mrmonterrosa/open-downmedia.git
   cd open-downmedia
   ```

2. Iniciar los contenedores:
   ```bash
   docker compose up --build -d
   ```

3. Abrir en el navegador:
   * **Frontend:** [http://localhost:8080](http://localhost:8080)
   * **Backend API:** [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

### Opción 2: Ejecución Local en Desarrollo

#### 1. Iniciar el Backend
```bash
cd backend
npm install
npm run dev
```
*El backend se iniciará en `http://localhost:3001`.*

#### 2. Iniciar el Frontend
En otra terminal:
```bash
cd frontend
npm install
npm start
```
*El frontend se iniciará en `http://localhost:4200` y se conectará automáticamente al backend local.*

---

## 🔌 Documentación de la API

### 1. Comprobación de Salud
* **Endpoint:** `GET /api/health`
* **Respuesta:**
  ```json
  {
    "status": "ok",
    "service": "open-downmedia-api",
    "timestamp": "2026-09-07T22:15:00.000Z",
    "ytdlp": {
      "ready": true,
      "version": "2026.08.19",
      "ffmpeg": true
    }
  }
  ```

### 2. Extracción de Metadatos
* **Endpoint:** `POST /api/media/info`
* **Body:**
  ```json
  {
    "url": "https://www.tiktok.com/@usuario/video/123456789"
  }
  ```

### 3. Descarga de Archivo
* **Endpoint:** `GET /api/media/download?url=...&format=video_hd`
* **Parámetros:**
  * `url`: URL pública del video o medio.
  * `format`: `video_hd` (por defecto), `video_sd`, `audio_mp3`, `audio_m4a`.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.

Desarrollado con ❤️ y código limpio por [Carlos González (Mr. Monterrosa)](https://github.com/mrmonterrosa).
