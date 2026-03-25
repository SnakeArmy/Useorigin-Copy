# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm install

# ── Development stage ────────────────────────────────────────
FROM node:20-alpine

# Security: non-root user
RUN addgroup -g 1001 -S nextjs && \
    adduser  -S nextjs  -u 1001 -G nextjs

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure the app directory is writable by non-root user
# (Next.js generates next-env.d.ts, .next cache, etc.)
RUN mkdir -p .next && chown -R nextjs:nextjs /app

# Next.js telemetry opt-out
ENV NEXT_TELEMETRY_DISABLED=1

# Drop to non-root user
USER nextjs

EXPOSE 3000

CMD ["npm", "run", "dev"]
