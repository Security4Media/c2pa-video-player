#!/bin/sh
# Runs as an nginx docker-entrypoint.d script before nginx starts.
#
# The container image ships without the mp4 test fixtures (see .dockerignore
# and the root Dockerfile) - they're mounted in at `docker run` time instead
# (e.g. -v ./mp4s:/usr/share/nginx/html/mp4s). The demo's "server videos"
# dropdown can't discover them via Vite's build-time glob in that case, since
# the files don't exist yet when the image is built. Generate a manifest here
# instead, which the app fetches at runtime and falls back from if absent.
set -eu

MP4_DIR="/usr/share/nginx/html/mp4s"
MANIFEST="$MP4_DIR/index.json"

[ -d "$MP4_DIR" ] || exit 0

names=""
for f in "$MP4_DIR"/*.mp4; do
    [ -e "$f" ] || continue
    name=$(basename "$f")
    name=$(echo "$name" | sed 's/\\/\\\\/g; s/"/\\"/g')
    if [ -z "$names" ]; then
        names="\"$name\""
    else
        names="$names,\"$name\""
    fi
done

echo "[$names]" > "$MANIFEST" 2>/dev/null || echo "40-generate-mp4-manifest.sh: warning: could not write $MANIFEST (read-only mount?)" >&2
