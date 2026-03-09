FROM node:20-alpine AS base

# Install system dependencies: ffmpeg + yt-dlp
RUN apk add --no-cache ffmpeg python3 curl ca-certificates openssl libc6-compat && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

# Install node deps
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

EXPOSE 3000

# Default: run web server
# Override CMD for the worker service: ["npm", "run", "worker:prod"]
CMD ["npm", "start"]
