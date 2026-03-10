# Multi-stage build for React C2PA Player
# Stage 1: Build the application
FROM node:20-alpine AS builder

# Build arguments for content folders
ARG VIDEOS_DIR=playlists/mp4s
ARG TRUST_DIR=trust

# Set working directory
WORKDIR /app

# Copy package files
COPY react-c2pa-player/package.json react-c2pa-player/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application source (excluding symlinks resolved below)
COPY react-c2pa-player/ ./

# Copy playlists and trust into public/ so Vite bundles them into dist/
# (the symlink in public/playlists won't resolve inside Docker)
COPY ${VIDEOS_DIR}/ ./public/playlists/mp4s
COPY ${TRUST_DIR} ./public/trust

# Build the application for production
RUN npm run build

# Stage 2: Production server with nginx
FROM nginx:alpine

# Copy built files from builder stage (includes playlists/ and trust/ from Vite)
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
