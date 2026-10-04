# Backend (Node.js)

Because this application was built using **Next.js 14 App Router** (a modern full-stack framework), the frontend and backend are seamlessly unified into a single monolithic codebase.

All backend Node.js code, REST API routes, and Server Actions are located in the following directory in the root of the repository:
- `../src/app/api/` (Next.js Route Handlers / Serverless Functions)
- `../src/lib/` (Backend utilities, Prisma client, session management)

This structure eliminates the need for CORS configuration and allows the backend to share TypeScript interfaces directly with the React frontend.
