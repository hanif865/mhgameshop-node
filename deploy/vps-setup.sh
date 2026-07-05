#!/usr/bin/env bash
# MH Game Shop — one-time VPS bootstrap (Ubuntu 22.04 / 24.04).
# Installs Docker + Compose, clones the repo, and starts the production stack.
#
# Usage (on a fresh VPS as root or a sudo user):
#   curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/deploy/vps-setup.sh | bash
# or copy this file up and run:  bash vps-setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-}"                 # e.g. git@github.com:you/mhgameshop-node.git
APP_DIR="${APP_DIR:-/opt/mhgameshop}"

echo "==> Updating packages"
sudo apt-get update -y

echo "==> Installing Docker + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo apt-get install -y docker-compose-plugin git ufw

echo "==> Firewall (SSH + HTTP/HTTPS)"
sudo ufw allow OpenSSH || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw --force enable || true

echo "==> Cloning repository"
if [ -n "$REPO_URL" ] && [ ! -d "$APP_DIR/.git" ]; then
  sudo git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo ""
echo "==> Next steps (manual, one time):"
echo "  1. Create env files:"
echo "       cp .env.example .env"
echo "       cp apps/api/.env.example apps/api/.env   # fill JWT_SECRET, keys, URLs"
echo "  2. Build & start:"
echo "       sudo docker compose -f docker-compose.prod.yml up -d --build"
echo "  3. Create the database schema + seed:"
echo "       sudo docker compose -f docker-compose.prod.yml exec api npm run db:push -w @mhgs/database"
echo "       sudo docker compose -f docker-compose.prod.yml exec api npm run db:seed -w @mhgs/database"
echo "  4. (optional) import legacy MySQL data — see README."
echo "  5. Point DNS A-records for the three subdomains at this server, then add SSL (see deploy/DEPLOY.md)."
echo ""
echo "Done. Stack files are in $APP_DIR"
