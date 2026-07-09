# Configuration

This guide details the environment variables used to configure Introspecter. All settings should be defined in your `.env` file in the project root directory.

---

## Prerequisites

Before configuring the project, install:

- **pnpm** (recommended package manager)
- **TypeScript**
- **Weights & Biases (wandb)** if you plan to use experiment tracking

---

## External APIs & LLMs

These keys enable the core AI analysis capabilities of the platform.

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENROUTER_API_KEY` | API key used to authenticate with the OpenRouter API | **Recommended** |
| `WANDB_API_KEY` | Weights & Biases API key for experiment tracking | Optional |

---

## Core System

Essential settings for application environment and file system configuration.

## Service Ports

Configure where services are exposed on your local machine.

| Service | Variable | Default Port | Access URL |
|---------|----------|--------------|------------|
| Frontend | `FRONTEND_PORT` | `3000` | `http://localhost:3000` |
| API | `API_PORT` | `3001` | `http://localhost:3001` |
| Backend | `BACKEND_PORT` | `8000` | `http://localhost:8000` |

---

## Database

Introspecter supports configuring the database using a connection string.

```bash
DATABASE_URL=postgresql://username:password@localhost:5432/introspecter
```

Alternatively, you can configure separate credentials for each service.

### API Database

```bash
INTROSPECTER_API_DB_USER=introspecter_user
INTROSPECTER_API_DB_PASSWORD=introspecter_pass
INTROSPECTER_API_DB_NAME=introspecter_db
```

### Backend Database

```bash
INTROSPECTER_BACKEND_DB_USER=backend_user
INTROSPECTER_BACKEND_DB_PASSWORD=backend_password
INTROSPECTER_BACKEND_DB_NAME=introspecter_backend
```

---

## Message Broker (RabbitMQ)

Credentials for RabbitMQ, which handles task queues and inter-service communication.

| Variable | Description | Default |
|----------|-------------|---------|
| `RABBITMQ_USER` | RabbitMQ username | `guest` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | `guest` |

---

## Quick Setup Checklist

- [ ] Install pnpm
- [ ] Install TypeScript
- [ ] Copy `.env.example` to `.env`
- [ ] Set `HOST_PROJECT_PATH` to your absolute project path
- [ ] Add at least `OPENAI_API_KEY` or `OPENROUTER_API_KEY`
- [ ] (Optional) Add `WANDB_API_KEY` for experiment tracking
- [ ] Configure `DATABASE_URL` (or the individual database credentials)
- [ ] Change RabbitMQ credentials if deploying publicly
- [ ] Verify port numbers don't conflict with other services

!!! success "Ready to Launch"
    Once your `.env` is configured, you're ready to start the application!