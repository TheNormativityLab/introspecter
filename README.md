# Web

## Installation

**Prerequisites:**
- Node.js (v18 or higher) - [Download from nodejs.org](https://nodejs.org/) | Check your version with `node -v`
- pnpm package manager - Install with `npm install -g pnpm`
- PostgreSQL database - [Download from postgresql.org](https://www.postgresql.org/download/)

### Setting Up PostgreSQL

1. **Install PostgreSQL**
   - Download and install PostgreSQL from [postgresql.org](https://www.postgresql.org/download/)
   - During installation, remember the password you set for the PostgreSQL superuser (postgres)
   - The default port is 5432

2. **Create a Database**
   - Open PostgreSQL command line (psql) or use a GUI tool like pgAdmin
   - Connect as the postgres user
   - Create a new database for the project:
   ```sql
   CREATE DATABASE introspecter;
   ```

3. **Create a Database User (Optional but Recommended)**
   - Create a dedicated user for the application:
   ```sql
   CREATE USER your_username WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE introspecter TO your_username;
   ```

4. **Get Your Connection String**
   - Your database URL will look like: `postgresql://username:password@localhost:5432/introspecter`
   - If using the default postgres user: `postgresql://postgres:your_password@localhost:5432/introspecter`
   - If you created a dedicated user: `postgresql://your_username:your_password@localhost:5432/introspecter`

### Frontend Setup

To install the frontend dependencies:
```bash
cd frontend
pnpm install
```

Create a `.env` file in the frontend project root:
```env
BACKEND_URL=http://localhost:8000
```

### Backend Setup

To install the backend dependencies:
```bash
cd backend
pnpm install
```

Create a `.env` file in the backend project root:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/introspecter
PORT=8000
```

**Important**: Replace the `DATABASE_URL` value with your actual PostgreSQL connection string.

### Database Setup and Population

To set up the database schema and populate it with initial data:

1. **Build the project (generates Prisma client and pushes schema to database):**
```bash
cd backend
pnpm build
```

2. **Populate the database with initial data:**
```bash
cd backend
node src/scripts/db_manager.js --path ../../wandb_data --database-url postgresql://username:password@localhost:5432/introspecter
```

Make sure to replace the `--database-url` parameter with your actual PostgreSQL connection string.

## Project Architecture

This is a full-stack web application built with modern JavaScript/TypeScript technologies.

### Technology Stack
- **Frontend**: Next.js 13+ with App Router, React, TypeScript, Tailwind CSS
- **Backend**: Node.js with Express.js, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Database Migration**: Prisma for schema management and database operations

### How It Works
1. **User Interface**: The Next.js frontend serves web pages and handles user interactions
2. **API Communication**: Frontend makes HTTP requests to the Express.js backend
3. **Data Storage**: Backend connects to PostgreSQL database using Prisma ORM to store and retrieve data
4. **Real-time Features**: Debate data is fetched and displayed dynamically

### Directory Structure

The directory structure below shows the most important parts of the project layout:

```
project-root/
├── frontend/                      # Next.js web application
│   ├── public/                   # Static assets (images, icons)
│   ├── src/
│   │   ├── app/                  # Next.js app router pages and API routes
│   │   │   ├── api/             # API endpoints (user auth, debates)
│   │   │   ├── dashboard/       # Dashboard page
│   │   │   ├── debate/[id]/     # Dynamic debate page (shows individual debates)
│   │   │   ├── layout.tsx       # Root layout component (shared across pages)
│   │   │   └── page.tsx         # Home page
│   │   ├── components/          # Reusable UI components
│   │   │   ├── button/         # Styled button component
│   │   │   ├── forms/          # Form components (login, registration)
│   │   │   ├── inputs/         # Input field components
│   │   │   └── navbar/         # Navigation bar component
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Utility functions and configurations
│   │   └── styles/             # Global CSS and Tailwind styles
│   ├── package.json            # Frontend dependencies and scripts
│   └── next.config.js          # Next.js configuration
└── backend/                     # Express.js API server
    ├── src/
    │   ├── app.ts              # Express app configuration and middleware setup
    │   ├── index.ts            # Server entry point (starts the server)
    │   ├── middleware/         # Custom middleware (authentication, logging, etc.)
    │   ├── models/             # Database models (data structure definitions)
    │   │   ├── Debate/        # Debate data model and schema
    │   │   └── User/          # User data model and schema
    │   ├── router/             # API route handlers
    │   │   ├── debates/       # Debate-related endpoints (CRUD operations)
    │   │   ├── users/         # User-related endpoints (auth, profiles)
    │   │   └── routes.ts      # Main router configuration
    │   ├── scripts/            # Database management and utility scripts
    │   │   ├── db_manager.js  # Database population script
    │   │   └── wandb_utils.js # Weights & Biases data processing utilities
    │   └── utils/              # Helper functions and utilities
    ├── prisma/
    │   └── schema.prisma       # Database schema definition
    ├── package.json            # Backend dependencies and scripts
    └── tsconfig.json           # TypeScript configuration
```

### Key Components Explained

**Frontend (Next.js)**
- **App Router**: Modern Next.js routing system using the `app/` directory
- **Server Components**: Components that run on the server for better performance
- **Dynamic Routes**: Pages like `debate/[id]` that change based on URL parameters
- **API Routes**: Backend-like endpoints that run on the Next.js server

**Backend (Express.js)**
- **RESTful API**: Follows REST principles for predictable API endpoints
- **Middleware**: Functions that process requests before they reach route handlers
- **Models**: Define how data is structured and stored in PostgreSQL
- **Routes**: Handle different HTTP requests (GET, POST, PUT, DELETE)
- **Prisma ORM**: Type-safe database client and schema management

**Database (PostgreSQL)**
- **Tables**: Relational database tables (e.g., "debates", "llm_configs")
- **Records**: Individual rows stored with structured data
- **Schema**: Defined in Prisma schema file for type safety and migrations

## Running the Application

**Build and Setup the Backend:**
```bash
cd backend
pnpm install
pnpm build
```

**Start the Backend Server:**
```bash
cd backend
pnpm run dev
```
The API server will run on http://localhost:8000

**Start the Frontend Development Server:**
```bash
cd frontend
pnpm run dev
```
The web application will be available at http://localhost:3000. Please create a username and password to login.

## Helpful Resources

- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **Express.js Guide**: [expressjs.com/en/guide](https://expressjs.com/en/guide/routing.html)
- **PostgreSQL Documentation**: [postgresql.org/docs](https://www.postgresql.org/docs/)
- **Prisma Documentation**: [prisma.io/docs](https://www.prisma.io/docs/)
- **TypeScript Handbook**: [typescriptlang.org/docs](https://www.typescriptlang.org/docs/)
- **React Documentation**: [react.dev](https://react.dev/learn)

## Troubleshooting

**Common Issues:**

1. **PostgreSQL Connection Errors**: 
   - Ensure PostgreSQL is running on your system
   - Verify the database URL in your `.env` file is correct
   - Check that the database `introspecter` exists
   - Ensure the user has proper permissions

2. **Port Already in Use**: Change the PORT in your backend `.env` file if 8000 is occupied

3. **pnpm Command Not Found**: Install pnpm globally with `npm install -g pnpm`

4. **Node Version Issues**: Use Node.js v18 or higher; consider using nvm to manage versions

5. **Prisma Client Generation Issues**: Run `pnpm build` to regenerate the Prisma client after schema changes

6. **Database Schema Issues**: If you modify the schema, run `pnpm build` to push changes to the database