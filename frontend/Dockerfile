# Etapa 1: Compilación de Angular
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Etapa 2: Servidor Web Nginx Alpine
FROM nginx:alpine

# Copiar artefactos compilados al directorio web de Nginx
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

# Copiar configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
