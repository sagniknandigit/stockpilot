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
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
