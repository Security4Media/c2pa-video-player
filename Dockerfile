# Builds the react-c2pa-player demo app as a standalone container image.
# Test-fixture media (public/mp4s, public/hls-fixtures) is excluded from the
# build context via .dockerignore, so this image stays lean; mount fixtures
# back in at `docker run` time (e.g. -v ./mp4s:/usr/share/nginx/html/mp4s,
# read-write so the manifest script below can index it) if a given
# deployment needs sample videos.

FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY react-c2pa-player/package.json react-c2pa-player/package.json
RUN npm ci

COPY react-c2pa-player react-c2pa-player
RUN npm run build-container --workspace=react-c2pa-player

FROM nginx:alpine AS runtime
COPY --from=builder /app/react-c2pa-player/dist /usr/share/nginx/html
COPY react-c2pa-player/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 react-c2pa-player/docker/40-generate-mp4-manifest.sh /docker-entrypoint.d/40-generate-mp4-manifest.sh

EXPOSE 8080
