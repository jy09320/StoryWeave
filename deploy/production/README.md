# StoryWeave Production Deployment

This directory contains the single-host production deployment for StoryWeave.

It uses:

- Docker Compose
- Caddy for reverse proxy and automatic HTTPS certificates
- PostgreSQL
- The existing frontend and backend Docker builds

## Prerequisites

Before deploying, make sure you have:

- A Linux server with Docker and Docker Compose installed
- A domain or free subdomain pointing to the server's public IP
- Ports `80` and `443` open on the server firewall / security group

If port `80` or `443` is blocked, Caddy cannot complete the ACME challenge and
HTTPS certificate issuance will fail.

## Recommended domain setup

This deployment works well with a free subdomain such as
`storyweave.is-a.dev`.

Point the subdomain to your server with an `A` record:

- Host: `storyweave`
- Value: `YOUR_SERVER_PUBLIC_IP`

If you are using Cloudflare DNS, start with the record set to `DNS only` until
certificate issuance succeeds.

## Initialize environment variables

From the repository root:

```bash
chmod +x deploy/production/scripts/*.sh
./deploy/production/scripts/init-env.sh
```

Then edit [deploy/production/.env](/E:/Projects/story-weave/deploy/production/.env).

At minimum, update:

- `APP_DOMAIN=storyweave.is-a.dev`
- `ACME_EMAIL=your-email@example.com`
- `OPENAI_API_KEY=...` or `ANTHROPIC_API_KEY=...`
- `BACKEND_CORS_ORIGINS=https://storyweave.is-a.dev`

`init-env.sh` will also generate fresh values for:

- `JWT_SECRET_KEY`
- `POSTGRES_PASSWORD`

## Deploy

```bash
./deploy/production/scripts/deploy.sh
```

On first startup, Caddy will request the HTTPS certificate automatically. If DNS
is correct and ports `80/443` are reachable, the site should become available
within a few minutes.

## Common commands

Deploy or update:

```bash
./deploy/production/scripts/deploy.sh
```

View logs:

```bash
./deploy/production/scripts/logs.sh
./deploy/production/scripts/logs.sh caddy
./deploy/production/scripts/logs.sh backend
```

Stop services:

```bash
./deploy/production/scripts/down.sh
```

Backup the database:

```bash
./deploy/production/scripts/backup-db.sh
```

## Service layout

- `caddy`: public entrypoint, HTTPS termination, reverse proxy
- `frontend`: static frontend container
- `backend`: FastAPI application
- `db`: PostgreSQL

Only these ports are exposed publicly:

- `80`
- `443`

The database is not exposed publicly.

## HTTPS behavior

Caddy handles certificate management automatically:

- Requests a Let's Encrypt certificate
- Renews the certificate automatically
- Redirects HTTP to HTTPS

This keeps the deployment simpler than a manual `certbot + nginx` setup.

## Troubleshooting

If HTTPS is not issued, check these first:

1. The domain resolves to the correct public IP
2. Ports `80` and `443` are open
3. The DNS record is not hidden behind a proxy during the first certificate request
4. `APP_DOMAIN` and `BACKEND_CORS_ORIGINS` match the actual domain

Then inspect the Caddy logs:

```bash
./deploy/production/scripts/logs.sh caddy
```
