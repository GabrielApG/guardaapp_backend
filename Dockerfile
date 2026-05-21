FROM node:20-alpine

WORKDIR /app

# Copia manifesto e lock file (gerado localmente com `npm install`)
COPY package*.json ./

# npm ci usa o lock file — mais rápido, determinístico, sem resolução de grafo
# Se não houver lock file, fallback para install com timeout aumentado
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm config set fetch-retry-mintimeout 20000 && \
      npm config set fetch-retry-maxtimeout 120000 && \
      npm config set fetch-retries 5 && \
      npm install --omit=dev; \
    fi

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
