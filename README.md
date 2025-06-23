# Web

## Installation

**Prerequisites:**
- Node.js (v18 or higher) - [Download from nodejs.org](https://nodejs.org/) | Check your version with `node -v`
- pnpm package manager - Install with `npm install -g pnpm`
- MongoDB Cloud account (free tier available) - [Sign up at mongodb.com](https://www.mongodb.com/cloud/atlas/register)
- Python (for database population script) - [Download from python.org](https://www.python.org/downloads/)

### Setting Up MongoDB Cloud

1. **Create a MongoDB Cloud Account**
   - Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) and sign up for free
   - Choose the free tier which provides 512 MB of storage at no cost

2. **Create a Database Cluster**
   - After logging in, select the "FREE" tier
   - Give your cluster a name (e.g., "debate-app")
    - Choose your preferred cloud provider and region (closest to your location for better performance)
   - Click "Create Deployment" and wait for deployment (takes 1-3 minutes)

3. **Set Up Database Access**
   - Go to "Database Access" in the left sidebar
   - Click "Add New Database User"
   - Choose "Password" authentication method
   - Create a username and secure password (save these credentials!)
   - Under "Database User Privileges", select "Read and write to any database"
   - Click "Add User"

4. **Configure Network Access**
   - Go to "Network Access" in the left sidebar
   - Click "Add IP Address"
   - For development, you can click "Allow Access from Anywhere" (adds 0.0.0.0/0)
   - For production, add only your specific IP addresses
   - Click "Confirm"

5. **Get Your Connection String**
   - Go back to "Database" in the left sidebar
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Select "Node.js" as the driver and version 4.1 or later
   - Copy the connection string (it looks like: `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`)
   - Replace `<username>` and `<password>` with the credentials you created in step 3

### Frontend Setup

To install the frontend dependencies:
```bash
cd web/frontend
pnpm install
```

Create a `.env` file in the frontend project root:
```env
BACKEND_URL=http://localhost:8000
```

### Backend Setup

To install the backend dependencies:
```bash
cd web/backend
pnpm install
```

Create a `.env` file in the backend project root:
```env
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/debate-app?retryWrites=true&w=majority
PORT=8000
```

**Important**: Replace the `MONGO_URI` value with your actual connection string from MongoDB Cloud.

### Database Population

To populate the database with initial data:
```bash
cd web/scripts
python logs.py --path="wandb_data" --mongo-uri="<your_mongodb_connection_string>"
```

Make sure to replace `<your_mongodb_connection_string>` with the same URI you used in your backend `.env` file.

## Project Architecture

This is a full-stack web application built with modern JavaScript/TypeScript technologies.

### Technology Stack
- **Frontend**: Next.js 13+ with App Router, React, TypeScript, Tailwind CSS
- **Backend**: Node.js with Express.js, TypeScript
- **Database**: MongoDB Cloud (NoSQL document database)

### How It Works
1. **User Interface**: The Next.js frontend serves web pages and handles user interactions
2. **API Communication**: Frontend makes HTTP requests to the Express.js backend
3. **Data Storage**: Backend connects to MongoDB Cloud to store and retrieve data
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
    │   └── utils/              # Helper functions and utilities
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
- **Models**: Define how data is structured and stored in MongoDB
- **Routes**: Handle different HTTP requests (GET, POST, PUT, DELETE)

**Database (MongoDB)**
- **Collections**: Like tables in SQL databases (e.g., "users", "debates")
- **Documents**: Individual records stored as JSON-like objects
- **Schema**: Structure definition for consistent data format

## Running the Application

**Start the Backend Server:**
```bash
cd web/backend
pnpm run dev
```
The API server will run on http://localhost:8000

**Start the Frontend Development Server:**
```bash
cd web/frontend
pnpm run dev
```
The web application will be available at http://localhost:3000. Please create a username and password to login.

## Helpful Resources

- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **Express.js Guide**: [expressjs.com/en/guide](https://expressjs.com/en/guide/routing.html)
- **MongoDB Atlas Tutorial**: [docs.mongodb.com/atlas](https://docs.mongodb.com/atlas/getting-started/)
- **TypeScript Handbook**: [typescriptlang.org/docs](https://www.typescriptlang.org/docs/)
- **React Documentation**: [react.dev](https://react.dev/learn)

## Troubleshooting

**Common Issues:**

1. **MongoDB Connection Errors**: Ensure your IP address is whitelisted in MongoDB Atlas Network Access
2. **Port Already in Use**: Change the PORT in your backend `.env` file if 8000 is occupied
3. **pnpm Command Not Found**: Install pnpm globally with `npm install -g pnpm`
4. **Node Version Issues**: Use Node.js v18 or higher; consider using nvm to manage versions