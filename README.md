# Open-DownMedia

> Descargador universal y privado de medios de redes sociales sin marca de agua.
> Proyecto Open Source desarrollado con arquitectura moderna en Angular, Node.js y contenedores Docker.
> Diseño minimalista basado en Modern Dark Bento-Grid y Brand Amber.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-v19+-red.svg)](https://angular.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

---

## Tabla de Contenidos

- [Descripción del Proyecto](#descripción-del-proyecto)
- [Características y Mejoras Implementadas](#características-y-mejoras-implementadas)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Librerías y Tecnologías Utilizadas](#librerías-y-tecnologías-utilizadas)
- [Estructura del Repositorio](#estructura-del-repositorio)
- [Ejecución en Entorno Local](#ejecución-en-entorno-local)
- [Despliegue en Dokploy](#despliegue-en-dokploy)
- [Documentación de la API REST](#documentación-de-la-api-rest)
- [Mejoras a Futuro](#mejoras-a-futuro)
- [Licencia](#licencia)

---

## Descripción del Proyecto

Open-DownMedia es una plataforma web integral que permite extraer y descargar contenido multimedia (videos en alta definición, pistas de audio MP3/M4A, fotografías individuales y galerías completas en archivos ZIP) desde las principales redes sociales y plataformas de contenido: TikTok, Instagram, YouTube, X (Twitter), Facebook, Reddit, Pinterest, Threads, Vimeo y SoundCloud.

El proyecto está construido bajo una estricta política de privacidad y rendimiento:
- **Política de Almacenamiento Cero (Zero-Storage Policy):** El servidor no conserva ninguna fotografía, video o audio descargado de forma permanente. Los medios se transmiten en tiempo real directamente al usuario o se eliminan automáticamente de forma inmediata tras completarse la transferencia.
- **Protección de Recursos y Estabilidad:** Dispone de un sistema integral de control de concurrencia, límites por dirección IP y memoria caché en RAM para evitar caídas o saturación del procesador ante picos de tráfico.

---

## Características y Mejoras Implementadas

### 1. Sistema de Control de Saturación y Concurrencia
- **Semáforo global de procesamiento:** Límite estricto de 3 descargas simultáneas en todo el servidor. Las solicitudes excedentes reciben una respuesta HTTP 503 con la cabecera `Retry-After: 5`, solicitando un reintento ordenado sin colapsar el sistema.
- **Límite de descarga por cliente:** Cada dirección IP solo puede ejecutar 1 descarga activa a la vez. Si intenta abrir múltiples descargas en paralelo, se rechaza de inmediato con código HTTP 429.
- **Límite de duración máxima:** Los videos de más de 30 minutos (1800 segundos) se rechazan antes de iniciar el procesamiento para evitar el consumo desmedido de ancho de banda y CPU.
- **Caché de metadatos en memoria:** Almacena en memoria RAM las respuestas de análisis durante 15 minutos con purga automática cada 5 minutos. Si varios usuarios consultan el mismo enlace, la respuesta se entrega en 0 milisegundos con 0% de uso de CPU.
- **Cooldown visual en el frontend:** El botón de descarga cuenta con un contador regresivo de 4 segundos tras cada clic para evitar dobles solicitudes involuntarias.

### 2. Monitorización y Telemetría en Tiempo Real
- Endpoint público de administración (`/api/admin/metrics?token=opendownmedia_admin_2026`) que expone el estado de los slots de descarga, memoria RAM consumida (RSS y Heap), porcentaje de aciertos de caché (*cache hits*) y tiempo de actividad (*uptime*).
- Modal interactivo en la interfaz del frontend con estilo Bento para auditar el estado del servidor en cualquier momento.

### 3. Extractores Especializados de Redes Complejas
- **Facebook:** Resolución automática de enlaces cortos (`/share/p/`, `/share/r/` y `fb.watch`). Extracción de imágenes en máxima resolución original mediante motor de bajo nivel `gallery-dl`, evitando la compresión habitual de los CDNs. Inyección de cabeceras de bot autorizado para sortear bloqueos de agentes en dominios `lookaside.fbsbx.com` y `scontent.fbcdn.net`.
- **Reddit:** Resolución automática de URLs de compartir (`/s/` y `/share/`). Extracción de contenido multimedia auténtico consultando directamente el feed oficial Atom/RSS (`/comments/<id>.rss`) de Reddit. Esto elimina por completo el falso banner naranja estático (`share.redd.it`) que Reddit inyecta en etiquetas OpenGraph, recuperando la foto real de `i.redd.it`. Adicionalmente, se filtran publicaciones de solo texto para evitar la descarga de elementos vacíos.
- **Instagram y TikTok:** Descargas sin marcas de agua de videos en formato HD y extracción de carruseles de fotos con previsualización proxy para evitar bloqueos por CORS o cabeceras Referer.

### 4. Optimización de la Experiencia de Descarga en Frontend
- **Descarga en la misma pestaña:** Eliminación total de `target="_blank"`. Para imágenes, el navegador realiza la petición binaria en segundo plano mediante `fetch` y `Blob`, iniciando la descarga en el gestor nativo del sistema operativo sin abrir pestañas en blanco ni salir de la vista actual.
- **Soporte de descarga con parámetro Base64:** El endpoint `/api/media/download` soporta de manera nativa la URL del recurso codificada en Base64 (`download?base64=...`), permitiendo descargas directas y limpias sin conflictos de caracteres especiales.
- **Estandarización de nombres de archivo:** Todos los archivos descargados llevan de forma obligatoria el prefijo `open_downmedia_` (por ejemplo: `open_downmedia_foto_1.jpg`, `open_downmedia_album.zip`, `open_downmedia_tiktok_video_hd.mp4`).

---

## Arquitectura del Sistema

El proyecto está diseñado siguiendo una arquitectura desacoplada y orientada a microservicios dentro de una red interna de Docker:

```
[ Cliente / Navegador ]
       |
       |  (Puerto 8080: HTTP)
       v
[ Nginx Reverse Proxy ] (Contenedor: open-downmedia-frontend)
       |
       +---> Rutas estáticas / SPA: Angular Browser Bundle
       |
       +---> Rutas /api/*: Proxy inverso hacia Backend (Puerto 3001)
                 |
                 v
       [ Node.js + Express ] (Contenedor: open-downmedia-backend)
                 |
                 +---> Capa de Seguridad (Anti-SSRF + Rate Limiting)
                 +---> Capa de Control (Slots de Concurrencia + Caché LRU)
                 +---> Capa de Enrutamiento y Controladores (Media & Admin)
                 |
                 +---> Servicios de Extracción Multimedia:
                           |---> ytdlp.service (yt-dlp + FFmpeg)
                           |---> image.service (gallery-dl, feeds Atom, CDNs)
                           +---> archiver (Compresión ZIP de álbumes al vuelo)
```

### Componentes Principales:

1. **Frontend (Angular):** Single Page Application estructurada con Signals para reactividad de grano fino, diseño responsive con Tailwind CSS bajo el tema Bento Dark, y comunicación asíncrona para recepción de blobs y transmisión de archivos.
2. **Reverse Proxy (Nginx Alpine):** Punto único de entrada en producción. Gestiona la entrega de archivos estáticos precompilados con compresión gzip y redirige de manera transparente las peticiones `/api/` al backend interno.
3. **Backend API (Node.js & TypeScript):** Servicio modular que valida URLs contra listas blancas estrictas y direcciones IP privadas (anti-SSRF), administra el semáforo de tareas pesadas y orquesta los binarios nativos.
4. **Motores de Extracción (yt-dlp, gallery-dl y FFmpeg):** Binarios ejecutados en un entorno Alpine Linux con soporte para Python 3 que procesan los flujos de audio y video, resolviendo formatos y remuxing en contenedores MP4/MP3.

---

## Librerías y Tecnologías Utilizadas

### Backend:
- **Node.js (v22+)** y **TypeScript:** Entorno de ejecución y tipado estricto.
- **Express:** Framework HTTP minimalista y modular.
- **yt-dlp:** Herramienta principal de línea de comandos para la extracción de streams de video y audio.
- **gallery-dl:** Extractor especializado en galerías de imágenes y publicaciones de redes sociales.
- **FFmpeg:** Procesamiento y conversión de formatos de audio y video.
- **archiver:** Generación en streaming de archivos comprimidos ZIP para álbumes de fotos.
- **express-rate-limit:** Protección contra ataques de denegación de servicio y control de frecuencia de peticiones.
- **zod:** Validación declarativa y segura de esquemas de datos de entrada.
- **cors:** Administración de políticas de origen cruzado con soporte para `exposedHeaders`.
- **btch-downloader:** Librería complementaria para soporte de redes sociales adicionales.

### Frontend:
- **Angular (v19+):** Framework frontend estructurado con componentes independientes (*standalone*), Signals reactivos y nueva sintaxis de control de flujo (`@if`, `@for`).
- **Tailwind CSS:** Framework de utilidades para la creación de la interfaz Modern Dark Bento-Grid.
- **RxJS:** Manejo de flujos de datos asíncronos y peticiones HTTP.
- **TypeScript:** Lógica de presentación fuertemente tipada.
- **Nginx (Alpine):** Servidor web de producción optimizado para contenedor ligero.

---

## Estructura del Repositorio

```
open-down-media/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── environment.ts        # Variables de entorno y rutas del sistema
│   │   ├── controllers/
│   │   │   └── media.controller.ts   # Controladores de información, descarga y proxy
│   │   ├── middleware/
│   │   │   └── security.ts           # Anti-SSRF, validación de dominios y Rate Limiting
│   │   ├── services/
│   │   │   ├── download-control.service.ts # Semáforo de concurrencia y caché en RAM
│   │   │   ├── image.service.ts      # Extracción de fotos, carruseles, Reddit y Facebook
│   │   │   └── ytdlp.service.ts      # Orquestación de yt-dlp y argumentos de descarga
│   │   └── index.ts                  # Configuración y arranque del servidor Express
│   ├── Dockerfile                    # Entorno Alpine con Python3, FFmpeg, yt-dlp y gallery-dl
│   ├── tsconfig.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── models/
│   │   │   │   └── media.model.ts    # Modelos TypeScript para medios y respuestas
│   │   │   ├── services/
│   │   │   │   └── downloader.service.ts # Cliente HTTP y codificación Base64
│   │   │   ├── app.html              # Plantilla Bento Grid con visor Lightbox
│   │   │   ├── app.ts                # Componente principal con Signals y descarga Blob
│   │   │   └── app.config.ts
│   │   └── index.html                # Metadatos SEO estructurados (Schema.org JSON-LD)
│   ├── nginx.conf                    # Configuración de proxy inverso y enrutamiento SPA
│   ├── Dockerfile                    # Compilación multi-etapa (Angular Build + Nginx)
│   ├── tailwind.config.js
│   └── package.json
├── docker-compose.yml                # Definición de servicios, redes y volúmenes
├── package.json                      # Scripts de compilación generales del proyecto
└── README.md
```

---

## Ejecución en Entorno Local

### Método 1: Utilizando Docker Compose (Recomendado)

Requisitos previos:
- Docker y Docker Compose instalados en el sistema operativo.

Pasos:
1. Clonar el repositorio:
   ```bash
   git clone https://github.com/mrmonterrosa/open-downmedia.git
   cd open-downmedia
   ```

2. Construir e iniciar los contenedores:
   ```bash
   docker compose up --build -d
   ```

3. Acceso en el navegador:
   - **Frontend:** `http://localhost:8080`
   - **API Backend:** `http://localhost:3001/api/health`
   - **Métricas del Servidor:** `http://localhost:8080/api/admin/metrics?token=opendownmedia_admin_2026`

4. Para detener la aplicación:
   ```bash
   docker compose down
   ```

---

### Método 2: Ejecución Manual en Desarrollo

Requisitos previos:
- Node.js versión 20 o superior.
- Python 3 instalado con `gallery-dl` (`pip install gallery-dl`).
- FFmpeg instalado y disponible en el PATH del sistema.
- `yt-dlp` disponible en el sistema.

1. **Configuración y arranque del Backend:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   El servicio quedará escuchando en el puerto `3001`.

2. **Configuración y arranque del Frontend:**
   En una terminal independiente:
   ```bash
   cd frontend
   npm install
   npm start
   ```
   La aplicación se iniciará en `http://localhost:4200` y redirigirá automáticamente las peticiones hacia `http://localhost:3001`.

---

## Despliegue en Dokploy

Dokploy es una plataforma de despliegue auto-hospedada basada en Docker. Existen dos métodos para desplegar Open-DownMedia en Dokploy:

### Método A: Despliegue mediante Compose (Opción recomendada)

1. Ingresar al panel de control de Dokploy y seleccionar el proyecto o entorno deseado.
2. Crear un nuevo servicio de tipo **Compose**.
3. En la configuración del origen del código:
   - Seleccionar **Git Provider** (o ingresar la URL pública del repositorio):
     `https://github.com/mrmonterrosa/open-downmedia.git`
   - Rama: `main`
   - Ruta del archivo Compose: `docker-compose.yml`
4. En la sección de **Dominios**:
   - Crear un dominio apuntando al servicio `frontend` con el puerto `80` del contenedor (que expone el Nginx configurado).
   - Activar la casilla de certificado SSL automático con Let's Encrypt.
5. Variables de entorno (opcionales en el servicio backend):
   - `PORT=3001`
   - `NODE_ENV=production`
   - `CORS_ORIGIN=*`
6. Presionar **Deploy**. Dokploy clonará el proyecto, construirá las imágenes multi-stage del frontend y del backend, iniciará la red interna y publicará la aplicación en el dominio configurado.

---

### Método B: Despliegue de Servicios Individuales (Multi-Service)

Si se desea gestionar el frontend y backend como aplicaciones separadas en Dokploy:

1. **Servicio Backend:**
   - Tipo de aplicación: **Application / Dockerfile**.
   - Repositorio: `https://github.com/mrmonterrosa/open-downmedia.git` en rama `main`.
   - Contexto de compilación: `./backend`
   - Ruta del Dockerfile: `./backend/Dockerfile`
   - Puerto de exposición: `3001`
   - Red: Conectar a una red compartida de Docker en Dokploy.

2. **Servicio Frontend:**
   - Tipo de aplicación: **Application / Dockerfile**.
   - Contexto de compilación: `./frontend`
   - Ruta del Dockerfile: `./frontend/Dockerfile`
   - Puerto de exposición: `80`
   - En el archivo `nginx.conf`, asegurar que la directiva `proxy_pass` apunte al nombre de host interno del contenedor backend en la misma red de Dokploy (`http://backend:3001/api/`).
   - Asignar el dominio público con HTTPS al frontend.

---

## Documentación de la API REST

### 1. Estado de Salud del Servicio
- **Método:** `GET /api/health`
- **Descripción:** Comprueba la disponibilidad del servidor y el estado de los binarios yt-dlp y FFmpeg.
- **Respuesta:**
  ```json
  {
    "status": "ok",
    "service": "open-downmedia-api",
    "timestamp": "2026-09-08T00:00:00.000Z",
    "ytdlp": {
      "ready": true,
      "version": "2026.08.19",
      "ffmpeg": true
    }
  }
  ```

### 2. Extracción de Metadatos
- **Método:** `POST /api/media/info`
- **Cabeceras:** `Content-Type: application/json`
- **Cuerpo:**
  ```json
  {
    "url": "https://www.tiktok.com/@usuario/video/123456789"
  }
  ```
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "123456789",
      "title": "Título del video",
      "thumbnail": "/api/media/image-proxy?url=...",
      "uploader": "Nombre de usuario",
      "platform": "TikTok",
      "mediaType": "video",
      "hasAudio": true,
      "hasVideo": true,
      "hasImages": false,
      "formats": [
        { "id": "video_hd", "label": "Video en Alta Calidad (HD)", "ext": "mp4" },
        { "id": "audio_mp3", "label": "Audio Independiente (MP3)", "ext": "mp3", "isAudioOnly": true }
      ]
    }
  }
  ```

### 3. Descarga de Archivos
- **Método:** `GET /api/media/download`
- **Parámetros Query admitidos:**
  - `url`: URL pública de la publicación a procesar.
  - `format`: Formato solicitado (`video_hd`, `video_sd`, `audio_mp3`, `audio_m4a`, `image_all`, `image_0`, `image_1`, etc.).
  - `base64`: URL directa de imagen o recurso codificada en Base64 (admite llamadas directas como `?base64=<cadena>`).
  - `filename`: Nombre sugerido para el archivo (se le antepondrá `open_downmedia_` si no lo posee).
- **Respuesta:** Archivo binario con cabeceras `Content-Type` correspondiente y `Content-Disposition: attachment; filename="open_downmedia_..."`.

### 4. Telemetría y Métricas del Servidor
- **Método:** `GET /api/admin/metrics?token=opendownmedia_admin_2026`
- **Descripción:** Información en tiempo real sobre el uso de recursos, concurrencia y caché.
- **Respuesta:**
  ```json
  {
    "timestamp": "2026-09-08T00:00:00.000Z",
    "uptime": "2h 15m 10s",
    "activeSlots": 0,
    "maxSlots": 3,
    "activeIps": [],
    "memory": {
      "rss": "85.42 MB",
      "heapUsed": "48.15 MB",
      "heapTotal": "62.30 MB"
    },
    "cache": {
      "size": 4,
      "hits": 18,
      "misses": 5,
      "hitRate": "78.26%"
    }
  }
  ```

---

## Mejoras a Futuro

1. **Cola de Procesamiento Distribuido (Redis + BullMQ):**
   - Implementar un sistema de colas asíncronas para desacoplar las tareas de transcodificación pesadas de la API REST, permitiendo escalar el procesamiento de descargas a través de múltiples workers independientes.
2. **Soporte de Descarga y Fusión en 4K/60fps:**
   - Incorporar perfiles avanzados de remuxing en workers dedicados para combinar flujos de video 4K (AV1/VP9) con flujos de audio de alta tasa de bits sin penalizar la respuesta del servidor web.
3. **Descarga de Canales y Listas de Reproducción:**
   - Permitir la selección granular de múltiples elementos de una playlist o canal para empaquetarlos en lotes o descargarlos secuencialmente.
4. **Soporte de Subtítulos Multilingües:**
   - Extracción automática y conversión de subtítulos incrustados o pistas cerradas en formatos estándar `.srt` y `.vtt`.
5. **Aplicación Web Progresiva (PWA) con Web Share Target:**
   - Compatibilidad completa para instalar Open-DownMedia en dispositivos móviles y registrar la aplicación en el menú nativo "Compartir" de Android e iOS.

---

## Licencia

Este proyecto está licenciado bajo los términos de la **Licencia MIT**. Consulta el archivo `LICENSE` para más detalles.

Desarrollado y mantenido por [Carlos González (Mr. Monterrosa)](https://github.com/mrmonterrosa).
