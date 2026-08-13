FROM node:22-alpine

WORKDIR /app
COPY index.js ./index.js
COPY package.json ./package.json

USER node
EXPOSE 9090
CMD ["node", "index.js"]
