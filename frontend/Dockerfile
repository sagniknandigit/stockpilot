# syntax=docker/dockerfile:1

# --- Build stage -------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Optional: point the SPA at an API on another origin. Defaults to same-origin /api/v1,
# which nginx below proxies to the backend container.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# --- Runtime stage -----------------------------------------------------------------------
FROM nginx:alpine
# The official image renders templates/*.template with envsubst at startup. Only variables
# that exist in the environment are substituted, so nginx's own $vars are untouched.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Where the API lives: the compose service by default; set it per environment when deploying.
ENV API_HOSTPORT=backend:8000
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
