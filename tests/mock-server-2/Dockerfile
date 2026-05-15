FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-fund --no-audit --omit=dev
COPY server.js ./
CMD ["node", "server.js"]
