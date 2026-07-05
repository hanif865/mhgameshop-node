# Build context is the repo root (see docker-compose.prod.yml).
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ---- Install dependencies (workspace-aware) ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
RUN npm install

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate

# ---- Runtime ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
WORKDIR /app/apps/api
EXPOSE 4000
# tsx runs TypeScript directly and resolves the @mhgs/* workspace packages.
CMD ["npx", "tsx", "src/index.ts"]
