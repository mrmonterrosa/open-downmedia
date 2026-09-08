# Open-DownMedia

> Descargador universal y privado de medios de redes sociales sin marca de agua.
> Proyecto Open Source desarrollado con arquitectura moderna en Angular, Node.js y contenedores Docker.
> Diseno minimalista basado en Modern Dark Bento-Grid y Brand Amber.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-v19+-red.svg)](https://angular.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

---

## Tabla de Contenidos

- [Descripcion del Proyecto](#descripcion-del-proyecto)
- [Caracteristicas y Mejoras Implementadas](#caracteristicas-y-mejoras-implementadas)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Librerias y Tecnologias Utilizadas](#librerias-y-tecnologias-utilizadas)
- [Estructura del Repositorio](#estructura-del-repositorio)
- [Ejecucion en Entorno Local](#ejecucion-en-entorno-local)
- [Despliegue en Dokploy](#despliegue-en-dokploy)
- [Documentacion de la API REST](#documentacion-de-la-api-rest)
- [Mejoras a Futuro](#mejoras-a-futuro)
- [Licencia](#licencia)

---

## Descripcion del Proyecto

Open-DownMedia es una plataforma web integral que permite extraer y descargar contenido multimedia (videos en alta definicion, pistas de audio MP3/M4A, fotografias individuales y galerias completas en archivos ZIP) desde las principales redes sociales y plataformas de contenido: TikTok, Instagram, YouTube, X (Twitter), Facebook, Reddit, Pinterest, Threads, Vimeo y SoundCloud.

El proyecto esta construido bajo una estricta politica de privacidad y rendimiento:
- **Politica de Almacenamiento Cero (Zero-Storage Policy):** El servidor no conserva ninguna fotografia, video o audio descargado de forma permanente. Los medios se transmiten en tiempo real directamente al usuario o se limpian de forma automatica inmediatamente tras completarse la transferencia.
- **Proteccion de Recursos y Estabilidad:** Dispone de un sistema integral de control de concurrencia, limites por direccion IP y memoria cache en RAM para evitar caidas o saturacion del procesador ante picos de trafico.

---

## Caracteristicas y Mejoras Implementadas

### 1. Sistema de Control de Saturacion y Concurrencia
- **Semaforo global de procesamiento:** Limite estricto de 3 descargas simultaneas en todo el servidor. Las solicitudes excedentes reciben una respuesta HTTP 503 con la cabecera `Retry-After: 5`, solicitando un reintento ordenado sin colapsar el sistema.
- **Limite de descarga por cliente:** Cada direccion IP solo puede ejecutar 1 descarga activa a la vez. Si intenta abrir multiples descargas en paralelo, se rechaza de inmediato con codigo HTTP 429.
- **Limite de duracion maxima:** Los videos de mas de 30 minutos (1800 segundos) se rechazan antes de iniciar el procesamiento para evitar el consumo desmedido de ancho de banda y CPU.
- **Cache de metadatos en memoria:** Almacena en memoria RAM las respuestas de analisis durante 15 minutos con purga automatica cada 5 minutos. Si varios usuarios consultan el mismo enlace, la respuesta se entrega en 0 milisegundos con 0% de uso de CPU.
- **Cooldown visual en el frontend:** El boton de descarga cuenta con un contador regresivo de 4 segundos tras cada clic para evitar dobles solicitudes involuntarias.

### 2. Monitorizacion y Telemetria en Tiempo Real
- Endpoint publico de administracion (`/api/admin/metrics?token=opendownmedia_admin_2026`) que expone el estado de los slots de descarga, memoria RAM consumida (RSS y Heap), porcentaje de aciertos de cache (*cache hits*) y tiempo de actividad (*uptime*).
- Modal interactivo en la interfaz del frontend con estilo Bento para auditar el estado del servidor en cualquier momento.

### 3. Extractores Especializados de Redes Complejas
- **Facebook:** Resolucion automatica de enlaces cortos (`/share/p/`, `/share/r/` y `fb.watch`). Extraccion de imagenes en maxima resolucion original mediante motor de bajo nivel `gallery-dl`, evitando la compresion habitual de los CDNs. Inyeccion de cabeceras de bot autorizado para sortear bloqueos de agentes en dominios `lookaside.fbsbx.com` y `scontent.fbcdn.net`.
- **Reddit:** Resolucion automatica de URLs de compartir (`/s/` y `/share/`). Extraccion de contenido multimedia autentico consultando directamente el feed oficial Atom/RSS (`/comments/<id>.rss`) de Reddit. Esto elimina por completo el falso banner naranja estatico (`share.redd.it`) que Reddit inyecta en etiquetas OpenGraph, recuperando la foto real de `i.redd.it`. Adicionalmente, se filtran publicaciones de solo texto para evitar la descarga de elementos vacios.
- **Instagram y TikTok:** Descargas sin marcas de agua de videos en formato HD y extraccion de carruseles de fotos con previsualizacion proxy para evitar bloqueos por CORS o cabeceras Referer.

### 4. Optimizacion de la Experiencia de Descarga en Frontend
- **Descarga en la misma pestana:** Eliminacion total de `target="_blank"`. Para imagenes, el navegador realiza la peticion binaria en segundo plano mediante `fetch` y `Blob`, iniciando la descarga en el gestor nativo del sistema operativo sin abrir pestanas en blanco ni salir de la vista actual.
- **Soporte de descarga con parametro Base64:** El endpoint `/api/media/download` soporta de manera nativa la URL del recurso codificada en Base64 (`download?base64=...`), permitiendo descargas directas y limpias sin conflictos de caracteres especiales.
- **Estandarizacion de nombres de archivo:** Todos los archivos descargados llevan de forma obligatoria el prefijo `open_downmedia_` (por ejemplo: `open_downmedia_foto_1.jpg`, `open_downmedia_album.zip`, `open_downmedia_tiktok_video_hd.mp4`).

---

## Arquitectura del Sistema

El proyecto esta disenado siguiendo una arquitectura desacoplada y orientada a microservicios dentro de una red interna de Docker:

```
[ Cliente / Navegador ]
       |
       |  (Puerto 8080: HTTP)
       v
[ Nginx Reverse Proxy ] (Contenedor: open-downmedia-frontend)
       |
       +---> Rutas estaticas / SPA: Angular Browser Bundle
       |
       +---> Rutas /api/*: Proxy inverso hacia Backend (Puerto 3001)
                 |
                 v
       [ Node.js + Express ] (Contenedor: open-downmedia-backend)
                 |
                 +---> Capa de Seguridad (Anti-SSRF + Rate Limiting)
                 +---> Capa de Control (Slots de Concurrencia + Cache LRU)
                 +---> Capa de Enrutamiento y Controladores (Media & Admin)
                 |
                 +---> Servicios de Extraccion Multimedia:
                           |---> ytdlp.service (yt-dlp + FFmpeg)
                           |---> image.service (gallery-dl, feeds Atom, CDNs)
                           +---> archiver (Compresion ZIP de albumes al vuelo)
```

### Componentes Principales:

1. **Frontend (Angular):** Single Page Application estructurada con Signals para reactividad de grano fino, diseno responsive con Tailwind CSS bajo el tema Bento Dark, y comunicacion asincrona para recepcion de blobs y transmision de archivos.
2. **Reverse Proxy (Nginx Alpine):** Punto unico de entrada en produccion. Gestiona la entrega de archivos estaticos precompilados con compresion gzip y redirige de manera transparente las peticiones `/api/` al backend interno.
3. **Backend API (Node.js & TypeScript):** Servicio modular que valida URLs contra listas blancas estrictas y direcciones IP privadas (anti-SSRF), administra el semaforo de tareas pesadas y orquesta los binarios nativos.
4. **Motores de Extraccion (yt-dlp, gallery-dl y FFmpeg):** Binarios ejecutados en un entorno Alpine Linux con soporte para Python 3 que procesan los flujos de audio y video, resolviendo formatos y remuxing en contenedores MP4/MP3.

---

## Librerias y Tecnologias Utilizadas

### Backend:
- **Node.js (v22+)** y **TypeScript:** Entorno de ejecucion y tipado estricto.
- **Express:** Framework HTTP minimalista y modular.
- **yt-dlp:** Herramienta principal de linea de comandos para la extraccion de streams de video y audio.
- **gallery-dl:** Extractor especializado en galerias de imagenes y publicaciones de redes sociales.
- **FFmpeg:** Procesamiento y conversion de formatos de audio y video.
- **archiver:** Generacion en streaming de archivos comprimidos ZIP para albumes de fotos.
- **express-rate-limit:** Proteccion contra ataques de denegacion de servicio y control de frecuencia de peticiones.
- **zod:** Validacion declarativa y segura de esquemas de datos de entrada.
- **cors:** Administracion de politicas de origen cruzado con soporte para `exposedHeaders`.
- **btch-downloader:** Libreria complementaria para soporte de redes sociales adicionales.

### Frontend:
- **Angular (v19+):** Framework frontend estructurado con componentes independientes (*standalone*), Signals reactivos y nueva sintaxis de control de flujo (`@if`, `@for`).
- **Tailwind CSS:** Framework de utilidades para la creacion de la interfaz Modern Dark Bento-Grid.
- **RxJS:** Manejo de flujos de datos asincronos y peticiones HTTP.
- **TypeScript:** Logica de presentacion fuertemente tipada.
- **Nginx (Alpine):** Servidor web de produccion optimizado para contenedor ligero.

---

## Estructura del Repositorio

```
open-down-media/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── environment.ts        # Variables de entorno y rutas del sistema
│   │   ├── controllers/
│   │   │   └── media.controller.ts   # Controladores de informacion, descarga y proxy
│   │   ├── middleware/
│   │   │   └── security.ts           # Anti-SSRF, validacion de dominios y Rate Limiting
│   │   ├── services/
│   │   │   ├── download-control.service.ts # Semaforo de concurrencia y cache en RAM
│   │   │   ├── image.service.ts      # Extraccion de fotos, carruseles, Reddit y Facebook
│   │   │   └── ytdlp.service.ts      # Orquestacion de yt-dlp y argumentos de descarga
│   │   └── index.ts                  # Configuracion y arranque del servidor Express
│   ├── Dockerfile                    # Entorno Alpine con Python3, FFmpeg, yt-dlp y gallery-dl
│   ├── tsconfig.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── models/
│   │   │   │   └── media.model.ts    # Modelos TypeScript para medios y respuestas
│   │   │   ├── services/
│   │   │   │   └── downloader.service.ts # Cliente HTTP y codificacion Base64
│   │   │   ├── app.html              # Plantilla Bento Grid con visor Lightbox
│   │   │   ├── app.ts                # Componente principal con Signals y descarga Blob
│   │   │   └── app.config.ts
│   │   └── index.html                # Metadatos SEO estructurados (Schema.org JSON-LD)
│   ├── nginx.conf                    # Configuracion de proxy inverso y enrutamiento SPA
│   ├── Dockerfile                    # Compilacion multi-etapa (Angular Build + Nginx)
│   ├── tailwind.config.js
│   └── package.json
├── docker-compose.yml                # Definicion de servicios, redes y volumenes
├── package.json                      # Scripts de compilacion generales del proyecto
└── README.md
```

---

## Ejecucion en Entorno Local

### Metodo 1: Utilizando Docker Compose (Recomendado)

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
   - **Metricas del Servidor:** `http://localhost:8080/api/admin/metrics?token=opendownmedia_admin_2026`

4. Para detener la aplicacion:
   ```bash
   docker compose down
   ```

---

### Metodo 2: Ejecucion Manual en Desarrollo

Requisitos previos:
- Node.js version 20 o superior.
- Python 3 instalado con `gallery-dl` (`pip install gallery-dl`).
- FFmpeg instalado y disponible en el PATH del sistema.
- `yt-dlp` disponible en el sistema.

1. **Configuracion y arranque del Backend:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   El servicio quedara escuchando en el puerto `3001`.

2. **Configuracion y arranque del Frontend:**
   En una terminal independiente:
   ```bash
   cd frontend
   npm install
   npm start
   ```
   La aplicacion se iniciara en `http://localhost:4200` y redirigira automaticamente las peticiones hacia `http://localhost:3001`.

---

## Despliegue en Dokploy

Dokploy es una plataforma de despliegue auto-hospedada basada en Docker. Existen dos metodos para desplegar Open-DownMedia en Dokploy:

### Metodo A: Despliegue mediante Compose (Opcion recomendada)

1. Ingresar al panel de control de Dokploy y seleccionar el proyecto o entorno deseado.
2. Crear un nuevo servicio de tipo **Compose**.
3. En la configuracion del origen del codigo:
   - Seleccionar **Git Provider** (o ingresar la URL publica del repositorio):
     `https://github.com/mrmonterrosa/open-downmedia.git`
   - Rama: `main`
   - Ruta del archivo Compose: `docker-compose.yml`
4. En la seccion de **Dominios**:
   - Crear un dominio apuntando al servicio `frontend` con el puerto `80` del contenedor (que expone el Nginx configurado).
   - Activar la casilla de certificado SSL automatico con Let's Encrypt.
5. Variables de entorno (opcionales en el servicio backend):
   - `PORT=3001`
   - `NODE_ENV=production`
   - `CORS_ORIGIN=*`
6. Presionar **Deploy**. Dokploy clonara el proyecto, construira las imagenes multi-stage del frontend y del backend, iniciara la red interna y publicara la aplicacion en el dominio configurado.

---

### Metodo B: Despliegue de Servicios Individuales (Multi-Service)

Si se desea gestionar el frontend y backend como aplicaciones separadas en Dokploy:

1. **Servicio Backend:**
   - Tipo de aplicacion: **Application / Dockerfile**.
   - Repositorio: `https://github.com/mrmonterrosa/open-downmedia.git` en rama `main`.
   - Contexto de compilacion: `./backend`
   - Ruta del Dockerfile: `./backend/Dockerfile`
   - Puerto de exposicion: `3001`
   - Red: Conectar a una red compartida de Docker en Dokploy.

2. **Servicio Frontend:**
   - Tipo de aplicacion: **Application / Dockerfile**.
   - Contexto de compilacion: `./frontend`
   - Ruta del Dockerfile: `./frontend/Dockerfile`
   - Puerto de exposicion: `80`
   - En el archivo `nginx.conf`, asegurar que la directiva `proxy_pass` apunte al nombre de host interno del contenedor backend en la misma red de Dokploy (`http://backend:3001/api/`).
   - Asignar el dominio publico con HTTPS al frontend.

---

## Documentacion de la API REST

### 1. Estado de Salud del Servicio
- **Metodo:** `GET /api/health`
- **Descripcion:** Comprueba la disponibilidad del servidor y el estado de los binarios yt-dlp y FFmpeg.
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

### 2. Extraccion de Metadatos
- **Metodo:** `POST /api/media/info`
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
      "title": "Titulo del video",
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
- **Metodo:** `GET /api/media/download`
- **Parametros Query admitidos:**
  - `url`: URL publica de la publicacion a procesar.
  - `format`: Formato solicitado (`video_hd`, `video_sd`, `audio_mp3`, `audio_m4a`, `image_all`, `image_0`, `image_1`, etc.).
  - `base64`: URL directa de imagen o recurso codificada en Base64 (admite llamadas directas como `?base64=<cadena>`).
  - `filename`: Nombre sugerido para el archivo (se le antepondra `open_downmedia_` si no lo posee).
- **Respuesta:** Archivo binario con cabeceras `Content-Type` correspondiente y `Content-Disposition: attachment; filename="open_downmedia_..."`.

### 4. Telemetria y Metricas del Servidor
- **Metodo:** `GET /api/admin/metrics?token=opendownmedia_admin_2026`
- **Descripcion:** Informacion en tiempo real sobre el uso de recursos, concurrencia y cache.
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
   - Implementar un sistema de colas asincronas para desacoplar las tareas de transcodificacion pesadas de la API REST, permitiendo escalar el procesamiento de descargas a traves de multiples workers independientes.
2. **Soporte de Descarga y Fusion en 4K/60fps:**
   - Incorporar perfiles avanzados de remuxing en workers dedicados para combinar flujos de video 4K (AV1/VP9) con flujos de audio de alta tasa de bits sin penalizar la respuesta del servidor web.
3. **Descarga de Canales y Listas de Reproduccion:**
   - Permitir la seleccion granular de multiples elementos de una playlist o canal para empaquetarlos en lotes o descargarlos secuencialmente.
4. **Soporte de Subtitulos Multilingues:**
   - Extraccion automatica y conversion de subtitulos incrustados o pistas cerradas en formatos estandar `.srt` y `.vtt`.
5. **Aplicacion Web Progresiva (PWA) con Web Share Target:**
   - Compatibilidad completa para instalar Open-DownMedia en dispositivos moviles y registrar la aplicacion en el menu nativo "Compartir" de Android e iOS.

---

## Licencia

Este proyecto esta licenciado bajo los terminos de la **Licencia MIT**. Consulta el archivo `LICENSE` para mas detalles.

Desarrollado y mantenido por [Carlos Gonzalez (Mr. Monterrosa)](https://github.com/mrmonterrosa).
