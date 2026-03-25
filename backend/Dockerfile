# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for layer caching
COPY package*.json ./
RUN npm install --omit=dev

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine

# Security: run as non-root
RUN addgroup -g 1001 -S appgroup && \
    adduser  -S appuser -u 1001 -G appgroup

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Drop to non-root user
USER appuser

EXPOSE 4000

CMD ["node", "src/index.js"]
