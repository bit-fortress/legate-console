FROM --platform=$BUILDPLATFORM node:22-alpine AS build

ARG VITE_API_BASE_URL=
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine

ENV API_UPSTREAM=http://legate-central:8080
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
