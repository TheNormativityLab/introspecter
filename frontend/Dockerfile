# Frontend
FROM node:24-bullseye-slim

# Install system dependencies and pnpm via corepack
RUN apt-get update && \
    apt-get install -y zsh git curl && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable && \
    corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy all source code
COPY . .

# Expose port
EXPOSE 3000

# Run the app
CMD ["pnpm", "run", "dev"]
