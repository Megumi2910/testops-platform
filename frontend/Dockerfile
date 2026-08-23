FROM node:24.17.0-alpine3.23 AS build

WORKDIR /app
ARG VCS_REF=unknown
ENV VITE_APP_REVISION=$VCS_REF
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.3-alpine
ARG VCS_REF=unknown
ENV TESTOPS_REVISION=$VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 8080
