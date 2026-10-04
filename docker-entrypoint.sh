#!/bin/sh
set -e

# Run Prisma schema push (since we don't have pre-generated migrations)
echo "Deploying database schema..."
npx prisma@5 db push --skip-generate

echo "Seeding database..."
# Run the seed script
npx tsx@4 prisma/seed.ts

echo "Starting Next.js..."
exec "$@"
