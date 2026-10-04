# Database (Schema + Seed)

The database configuration, PostgreSQL schema, and seed scripts are located in the root of the repository to properly integrate with the Prisma ORM.

You can find the database files here:
- `../prisma/schema.prisma` (Database Schema)
- `../prisma/seed.ts` (Database Seeding Script)
- `../seed-data/` (Raw CSV data used for seeding the database)

The application uses PostgreSQL as its primary datastore, managed via Prisma.
