#!/bin/sh
set -e


PRISMA_DONE_FILE="/app/.prisma_done"

if [ ! -f "$PRISMA_DONE_FILE" ]; then
  echo "Running Prisma generate and DB push..."
  pnpm prisma generate
  pnpm prisma db push
  pnpm migrate-data
  touch "$PRISMA_DONE_FILE"
fi

echo "Starting backend..."
exec pnpm run dev
