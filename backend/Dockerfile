# Use Node base image
FROM node:24-bullseye-slim

# Install dependencies
RUN apt-get update && apt-get install -y curl git zsh \
    && corepack enable \
    && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files first (for caching)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Copy all source code
COPY . .

# Expose port
EXPOSE 8000

# Use entrypoint script to run build/migrations at container start
ENTRYPOINT [ "sh", "/app/docker-entrypoint.sh" ]
