FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./

# Copy packages and apps required by Web
COPY packages ./packages
COPY apps/web ./apps/web

# Install all dependencies
RUN pnpm install --frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_DEV_AUTO_LOGIN=false
ENV API_URL=http://api:4000

# Build Next.js application
RUN pnpm --filter @mc-admin/web build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@mc-admin/web", "start"]
