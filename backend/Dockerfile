# Etapa de construcción y ejecución
FROM node:22-alpine

# Instalar dependencias del sistema: Python3, FFmpeg, curl para yt-dlp
RUN apk add --no-cache python3 ffmpeg curl ca-certificates

# Descargar e instalar la versión más reciente de yt-dlp en el PATH del sistema
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copiar manifiestos de dependencias
COPY package*.json tsconfig.json ./

# Instalar dependencias completas para compilar TypeScript
RUN npm install

# Copiar código fuente
COPY src/ ./src/

# Compilar TypeScript a JavaScript
RUN npm run build

# Eliminar dependencias de desarrollo para reducir el tamaño de la imagen
RUN npm prune --omit=dev

# Crear directorios para descargas y binarios
RUN mkdir -p /app/temp_downloads /app/bin && chmod 777 /app/temp_downloads /app/bin

ENV NODE_ENV=production
ENV PORT=3001
ENV BIN_DIR=/usr/local/bin
ENV DOWNLOADS_DIR=/app/temp_downloads

EXPOSE 3001

CMD ["node", "dist/index.js"]
