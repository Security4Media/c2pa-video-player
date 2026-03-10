# Docker Configuration Files

This directory contains Docker-related configuration files for the React C2PA Player.

## Directory Structure

```
docker/
└── nginx/
    └── default.conf    # Nginx server configuration
```

## Files

### nginx/default.conf

The nginx configuration file that defines how the web server handles requests:

- **Port**: Listens on port 80
- **Root**: Serves files from `/usr/share/nginx/html`
- **Gzip Compression**: Enabled for better performance
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **CORS**: Configured for video streaming endpoints

#### Location Blocks

1. **`/playlists/`**
   - Video manifest files and streaming content
   - No caching (always fresh)
   - CORS headers enabled
   - Handles OPTIONS preflight requests

2. **`/trust/`**
   - Certificate and trust configuration files
   - Cached for 1 hour
   - CORS headers enabled

3. **`/assets/`**
   - Static application assets (JS, CSS, images)
   - Cached for 1 year (immutable)

4. **`/` (root)**
   - SPA routing support
   - Falls back to `index.html` for client-side routing

## Modifying Configuration

To modify the nginx configuration:

1. Edit `docker/nginx/default.conf`
2. Rebuild the Docker image:
   ```bash
   docker-compose build --no-cache
   ```
3. Restart the container:
   ```bash
   docker-compose up -d
   ```

## Testing Configuration

To test nginx configuration syntax before building:

```bash
# Run nginx config test in a temporary container
docker run --rm -v $(pwd)/docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine nginx -t
```

## Common Customizations

### Change Caching Duration

In `default.conf`, modify the `Cache-Control` headers:

```nginx
location /assets/ {
    expires 30d;  # Change from 1y to 30 days
    add_header Cache-Control "public, immutable";
}
```

### Add New Location Block

```nginx
location /api/ {
    proxy_pass http://backend:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Enable HTTPS (with reverse proxy)

For production, use a reverse proxy like Traefik or Nginx Proxy Manager to handle SSL/TLS termination.

## Debugging

View nginx logs from the running container:

```bash
# Access logs
docker-compose logs -f react-c2pa-player

# Execute into container
docker-compose exec react-c2pa-player sh

# Check nginx config inside container
nginx -t

# View config file
cat /etc/nginx/conf.d/default.conf
```
