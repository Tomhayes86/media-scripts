# Small Node image; better-sqlite3 needs build tools for the native binding on first install.
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY selfhosted/package.json selfhosted/package.json
RUN cd selfhosted && npm install --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r flighty && useradd -r -g flighty flighty

# App code
COPY --chown=flighty:flighty selfhosted/ /app/selfhosted/
COPY --chown=flighty:flighty frontend/ /app/frontend/
COPY --from=build --chown=flighty:flighty /app/selfhosted/node_modules /app/selfhosted/node_modules

RUN mkdir -p /app/data && chown flighty:flighty /app/data
USER flighty

ENV DB_PATH=/app/data/flighty.db
ENV FRONTEND_DIR=/app/frontend
ENV PORT=8080
EXPOSE 8080

WORKDIR /app/selfhosted
CMD ["node", "server.js"]
