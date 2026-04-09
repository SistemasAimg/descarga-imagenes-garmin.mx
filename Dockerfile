FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV DOWNLOADS_DIR=/tmp/garmin-downloads

EXPOSE 8080

CMD ["node", "server.js"]
