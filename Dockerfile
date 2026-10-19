# syntax=docker/dockerfile:1
# One image for every role: web (Next.js), worker, migrate. The compose `command` picks the role.

ARG NODE_IMAGE=node:24-slim
ARG CLAUDE_CODE_VERSION=2.1.303

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: install all npm dependencies (cached until package*.json changes)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- dev: used by compose.dev.yaml; the source code is bind-mounted over /app
FROM deps AS dev
ARG CLAUDE_CODE_VERSION
RUN npm i -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} --no-audit --no-fund && npm cache clean --force
ENV NODE_ENV=development

# ---- build: Next.js standalone output + bundled worker (dist/*.js)
FROM deps AS build
COPY . .
RUN npm run build

# ---- runtime: small production image, non-root user
FROM base AS runtime
ARG CLAUDE_CODE_VERSION
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# The Claude Code CLI is used by the worker's optional LLM enrichment step.
RUN npm i -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf /root/.npm /tmp/*
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/lib/db/migrations ./lib/db/migrations
# The `node` user (uid 1000) ships with the base image; its HOME (/home/node) is writable,
# which the Claude CLI needs for its config.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
