FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./

# Copy packages and apps required by API
COPY packages ./packages
COPY apps/api ./apps/api

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma Client
RUN pnpm --filter @mc-admin/db db:generate

# Build API TypeScript output
RUN pnpm --filter @mc-admin/api build

EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=development

CMD ["pnpm", "--filter", "@mc-admin/api", "dev"]
