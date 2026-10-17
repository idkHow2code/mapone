# ---- Dependencies (shared by dev, build and test) ----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# ---- Dev stage: restarts on code changes (docker-compose.yaml mounts ./src) ----
FROM deps AS dev
COPY . .
EXPOSE 8000
CMD ["npm", "run", "dev"]

# ---- Build stage: compile TypeScript ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- Test stage: run unit tests with coverage (docker compose run --rm backend-test) ----
FROM build AS test
ENV NODE_ENV=test
CMD ["npm", "run", "test:coverage"]

# ---- Runtime stage: production deps + compiled output only ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 8000
CMD ["node", "dist/index.js"]
