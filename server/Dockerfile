# Dockerfile para Dashboard Unificado Ingrill
FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el código
COPY . .

# Exponer el puerto
EXPOSE 4001

# Iniciar el servidor
CMD ["node", "index.js"]
