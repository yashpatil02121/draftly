# Single deployable: builds the React client and the Fastify server; the server serves both.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY client/package.json client/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter client build && pnpm --filter server build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/client/package.json client/
RUN pnpm install --frozen-lockfile --prod --filter server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/migrations server/migrations
COPY --from=build /app/client/dist client/dist
EXPOSE 3001
CMD ["node", "server/dist/server.js"]
