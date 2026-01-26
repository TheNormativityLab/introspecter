# Use Node base image
FROM node:24-bullseye-slim

# Set pnpm home and update PATH
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install dependencies and setup pnpm
RUN apt-get update && apt-get install -y curl git zsh \
    && corepack enable \
    && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files first
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .

EXPOSE 8000
ENTRYPOINT [ "sh", "/app/docker-entrypoint.sh" ]