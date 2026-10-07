FROM node:24-alpine

ARG BUILD_VERSION
ARG BUILD_ARCH

LABEL \
  io.hass.version="$BUILD_VERSION" \
  io.hass.type="app" \
  io.hass.arch="$BUILD_ARCH"

WORKDIR /app
COPY server.mjs /app/server.mjs

EXPOSE 3000
ENTRYPOINT ["node", "/app/server.mjs"]
