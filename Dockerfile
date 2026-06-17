# Multi-stage build: compile the Angular bundle, then run the Bun server that
# serves both the bundle and the /api backend (DEPLOYMENT.md §2.4).

# ---- build stage: install everything, build the Angular bundle ----
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build            # → dist/aikido-video-library/browser

# ---- runtime stage: production deps + server + built assets ----
FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY server ./server
COPY drizzle.config.ts ./
COPY --from=build /app/dist ./dist
# Apply migrations against the mounted volume, then serve.
CMD ["sh", "-c", "bun run db:migrate && bun run server/index.ts"]
