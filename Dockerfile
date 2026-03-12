# ============================================
# Stage 1: Build the frontend
# ============================================
FROM node:20-alpine AS frontend-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ============================================
# Stage 2: Install server dependencies
# ============================================
FROM node:20-alpine AS server-deps

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ============================================
# Stage 3: Production image
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Copy server code + production deps
COPY server/ ./server/
COPY --from=server-deps /app/server/node_modules ./server/node_modules

# Copy built frontend into server/public
COPY --from=frontend-build /app/client/dist ./server/public

EXPOSE 3000

CMD ["node", "server/index.js"]
