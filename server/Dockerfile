# Ember en un solo contenedor: la app web instalable (PWA) + la sincronización cifrada.
# Desde la raíz del proyecto:  docker build -f server/Dockerfile -t ember .

FROM node:24-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY server/sync-server.mjs .
COPY --from=web /src/dist ./public
ENV PORT=8787 HOST=0.0.0.0 DATA_DIR=/data STATIC_DIR=/app/public
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "sync-server.mjs"]
