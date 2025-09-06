# Canvas CLI Docker Image
# Multi-stage build for optimal size and security

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install -g typescript

# Copy source code
COPY src ./src
COPY docs ./docs

# Build application
RUN npm run build

# Runtime stage
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    bash \
    python3 \
    py3-pip \
    build-base

# Create non-root user
RUN addgroup -g 1001 -S canvas && \
    adduser -u 1001 -S canvas -G canvas

WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=canvas:canvas /app/dist ./dist
COPY --from=builder --chown=canvas:canvas /app/node_modules ./node_modules
COPY --from=builder --chown=canvas:canvas /app/package.json ./
COPY --from=builder --chown=canvas:canvas /app/docs ./docs

# Create config directory
RUN mkdir -p /home/canvas/.canvas-cli && \
    chown -R canvas:canvas /home/canvas/.canvas-cli

# Switch to non-root user
USER canvas

# Set environment variables
ENV NODE_ENV=production \
    CANVAS_HOME=/home/canvas/.canvas-cli \
    PATH="/app/dist:${PATH}"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node dist/index.js --version || exit 1

# Default command
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]