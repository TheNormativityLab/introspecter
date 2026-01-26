#!/bin/sh
set -e

PRISMA_DONE_FILE="/app/.prisma_done"

if [ ! -f "$PRISMA_DONE_FILE" ]; then
  echo "Running Prisma generate and DB push..."
  pnpm exec prisma generate
  pnpm exec prisma db push
  pnpm run migrate-data
  touch "$PRISMA_DONE_FILE"
fi

echo "Starting backend..."
exec pnpm run dev