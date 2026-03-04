# ── Development stage ─────────────────────────────────────────────────────────
# Used by docker-compose.yml (target: development)
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci                  # Clean install (uses package-lock.json exactly)

COPY . .
RUN npm run build           # Outputs to /app/dist

# ── Production stage (nginx) ──────────────────────────────────────────────────
FROM nginx:1.25-alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config: serve SPA, proxy /api to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
