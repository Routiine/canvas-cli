# Stage 1: Build
FROM node:20.18.2-alpine3.21 AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for TypeScript)
RUN npm ci

# Copy source
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Runtime
FROM node:20.18.2-alpine3.21

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Create non-root user
RUN addgroup -g 1001 -S canvas && adduser -u 1001 -S canvas -G canvas

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Copy other needed files (allow missing directories)
RUN mkdir -p recipes docs
COPY --from=builder /app/src/. ./src/. 2>/dev/null || true

# Set ownership
RUN chown -R canvas:canvas /app

USER canvas

# Expose dashboard port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node dist/index.js --version > /dev/null 2>&1 || exit 1

CMD ["node", "dist/index.js"]
