#############################################
# Multi-stage Dockerfile (pnpm + SWC build) #
#############################################

# Base stage: Setup environment and pnpm
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" \
    NODE_ENV=production \
    TZ=UTC \
    CI=true
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && mkdir -p /pnpm/store
WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Pre-fetch dependencies
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

#############################################
# Build stage (TypeScript -> JS)            #
#############################################
FROM base AS build
# prisma-specific: generate needs the DB URL or a skip flag
ARG DATABASE_URL 
ARG PRISMA_SKIP_POSTINSTALL_GENERATE=true

ENV NODE_ENV=development

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client if needed, then build
RUN npx prisma generate	
RUN pnpm run build

#############################################
# Production dependencies stage             #
#############################################
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

#############################################
# Final runtime image                       #
#############################################
FROM node:22-slim AS runner
ENV NODE_ENV=production \
    TZ=UTC

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts and production modules
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma

RUN npx prisma generate

# Security: run as non-root user
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:4000/status || exit 1

CMD ["node", "dist/index.js"]