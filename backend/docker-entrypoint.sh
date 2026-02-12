#!/bin/sh
set -e

echo "Pushing database schema..."
pnpm run db:push

echo "Running data migration in background..."
pnpm run migrate-data

echo "Starting server..."
pnpm run start