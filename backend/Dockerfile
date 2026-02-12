FROM node:18-alpine

RUN apk add --no-cache python3 py3-pip curl


RUN pip3 install --no-cache-dir --break-system-packages wandb


RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install

COPY prisma ./prisma/

RUN pnpm exec prisma generate

COPY . .

RUN pnpm run build

EXPOSE 8000

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]