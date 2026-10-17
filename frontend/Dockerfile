# ---- Dependencies (shared by dev and build) ----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# ---- Dev stage: Vite dev server with hot reload (docker-compose.yaml mounts ./src) ----
FROM deps AS dev
COPY . .
EXPOSE 8001
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- Build stage: compile the React app ----
FROM deps AS build
COPY . .

# Vite inlines VITE_* vars at build time
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---- Runtime stage: serve static files with nginx ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8001
CMD ["nginx", "-g", "daemon off;"]
