# Image de l'API ALLÔ-COURSIER. Construire depuis la racine du projet :
#   docker build -f apps/api/Dockerfile -t allo-coursier-api .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --no-audit --no-fund
COPY apps/api apps/api
RUN cd apps/api && npx prisma generate && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3002 UPLOAD_DIR=/data/uploads
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3002/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applique les migrations en attente puis démarre l'API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
