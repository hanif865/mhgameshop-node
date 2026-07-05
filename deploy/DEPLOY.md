# Deployment Guide — MH Game Shop (VPS)

Deploys the full stack (api, worker, web, admin, postgres, redis, nginx) with
Docker Compose on a single Ubuntu VPS.

## Quick start — IP only (no domain yet)

Use this to go live immediately on the raw server IP, before you have a domain.
Each app is exposed on its own port; nginx is skipped.

```bash
# 1. bootstrap (installs docker etc.)
export REPO_URL=https://github.com/Mahmud865/mhgameshop-node.git
curl -fsSL https://raw.githubusercontent.com/Mahmud865/mhgameshop-node/main/deploy/vps-setup.sh | bash
cd /opt/mhgameshop

# 2. open app ports
sudo ufw allow 3000/tcp && sudo ufw allow 3001/tcp && sudo ufw allow 4000/tcp

# 3. env — replace 203.0.113.10 with YOUR server IP
cat > .env <<EOF
POSTGRES_USER=mhgs
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=mhgameshop
DATABASE_URL=postgresql://mhgs:REPLACE_WITH_ABOVE_PASSWORD@postgres:5432/mhgameshop?schema=public
NEXT_PUBLIC_API_URL=http://203.0.113.10:4000
EOF

cp apps/api/.env.example apps/api/.env
# edit apps/api/.env — at minimum set:
#   DATABASE_URL   (same as above, host = postgres)
#   REDIS_URL=redis://redis:6379
#   JWT_SECRET     (long random)
#   COOKIE_SECURE=false           # REQUIRED over plain HTTP or login breaks
#   APP_URL=http://203.0.113.10:4000
#   WEB_URL=http://203.0.113.10:3000
#   ADMIN_URL=http://203.0.113.10:3001

# 4. build & run
sudo docker compose -f docker-compose.ip.yml up -d --build

# 5. database
sudo docker compose -f docker-compose.ip.yml exec api npm run db:push -w @mhgs/database
sudo docker compose -f docker-compose.ip.yml exec api npm run db:seed -w @mhgs/database
```

Open **http://SERVER_IP:3000** (store), **:3001** (admin), **:4000/api/health** (api).
Make yourself admin: register on the store, then

```bash
sudo docker compose -f docker-compose.ip.yml exec postgres \
  psql -U mhgs -d mhgameshop -c "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

When your domain is ready, switch to the full guide below (nginx + subdomains + SSL)
and set `COOKIE_SECURE=true`.

---

## 0. Prerequisites (domain-based, full stack)

- A VPS (Ubuntu 22.04/24.04, ≥ 2 GB RAM recommended) with root/sudo SSH access.
- A domain with three A-records pointing at the VPS IP:
  - `mhgameshop.com`         → storefront
  - `admin.mhgameshop.com`   → admin panel
  - `api.mhgameshop.com`     → API
- The GitHub repo URL for this project.

## 1. Bootstrap the server

```bash
ssh root@YOUR_VPS_IP
export REPO_URL=git@github.com:YOU/mhgameshop-node.git   # or https://...
curl -fsSL https://raw.githubusercontent.com/YOU/mhgameshop-node/main/deploy/vps-setup.sh | bash
# or: scp the repo up and run  bash deploy/vps-setup.sh
cd /opt/mhgameshop
```

This installs Docker + Compose, opens the firewall, and clones the repo.

## 2. Configure environment

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

Edit `.env` (root — used by compose):

```
POSTGRES_USER=mhgs
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=mhgameshop
DATABASE_URL=postgresql://mhgs:<strong-password>@postgres:5432/mhgameshop?schema=public
NEXT_PUBLIC_API_URL=https://api.mhgameshop.com
```

Edit `apps/api/.env` (secrets):

```
NODE_ENV=production
DATABASE_URL=postgresql://mhgs:<strong-password>@postgres:5432/mhgameshop?schema=public
REDIS_URL=redis://redis:6379
JWT_SECRET=<long-random-string>
APP_URL=https://api.mhgameshop.com
WEB_URL=https://mhgameshop.com
ADMIN_URL=https://admin.mhgameshop.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://api.mhgameshop.com/api/auth/google/callback
TOPUPNET_API_KEY=...
TOPUPNET_BASE_URL=https://api.topupnet.com/api/v1
UDDOKTAPAY_API_KEY=...
UDDOKTAPAY_BASE_URL=https://<your>.uddoktapay.com/api
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

> `DATABASE_URL` uses host `postgres` / `REDIS_URL` uses host `redis` — these are
> the compose service names, not `localhost`.

## 3. Build & start

```bash
sudo docker compose -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.prod.yml ps
```

## 4. Database

```bash
# create schema
sudo docker compose -f docker-compose.prod.yml exec api npm run db:push -w @mhgs/database
# baseline settings
sudo docker compose -f docker-compose.prod.yml exec api npm run db:seed -w @mhgs/database
```

Make yourself admin (via Postgres):

```bash
sudo docker compose -f docker-compose.prod.yml exec postgres \
  psql -U mhgs -d mhgameshop -c "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

(Register that email on the storefront first.)

## 5. SSL (Let's Encrypt)

The bundled nginx serves HTTP (port 80). For HTTPS, the simplest path is to run
certbot on the host and terminate TLS there, **or** add a certbot companion.
Quick host-certbot approach:

```bash
sudo apt-get install -y certbot
sudo docker compose -f docker-compose.prod.yml stop nginx
sudo certbot certonly --standalone \
  -d mhgameshop.com -d www.mhgameshop.com \
  -d admin.mhgameshop.com -d api.mhgameshop.com
```

Then mount the certs into nginx and add `listen 443 ssl;` server blocks
referencing `/etc/letsencrypt/...`, and redirect 80→443. (Alternatively swap
nginx for Caddy, which auto-provisions certificates.)

## 6. Updating a deployed app

```bash
cd /opt/mhgameshop
git pull
sudo docker compose -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.prod.yml exec api npm run db:deploy -w @mhgs/database
```

## 7. Logs & health

```bash
sudo docker compose -f docker-compose.prod.yml logs -f api
curl https://api.mhgameshop.com/api/health
```
