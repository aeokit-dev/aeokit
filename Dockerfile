FROM node:24-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @aeokit/product-ui build && pnpm --filter @aeokit/cli build && pnpm --filter @aeokit/api build && pnpm --filter @aeokit/worker build

FROM node:24-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 8787

CMD ["pnpm", "--filter", "@aeokit/api", "start"]
