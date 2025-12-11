# Configuration

This guide details the environment variables used to configure Introspecter. All settings should be defined in your `.env` file in the project root directory.

---

## External APIs & LLMs

These keys enable the core AI analysis capabilities of the platform.

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI key for GPT-4o Mini / 3.5 Turbo | **Recommended** |
| `TOGETHER_API_KEY` | Together AI key for Llama and Mistral models | **Recommended** |
| `KSCOPE_API_KEY` | Kaleidoscope service API key | Optional |
| `KSCOPE_API_BASE` | Base URL for Kaleidoscope API endpoints | Optional |

!!! tip "Provider Selection"
    You only need to provide keys for the specific AI services you intend to use. However, `OPENAI_API_KEY` and `TOGETHER_API_KEY` is recommended for the default setup.

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

## Database Credentials

Introspecter uses separate databases for API and Backend services.

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

- [ ] Copy `.env.example` to `.env`
- [ ] Set `HOST_PROJECT_PATH` to your absolute project path
- [ ] Add at least `OPENAI_API_KEY` for AI capabilities
- [ ] Review and customize database credentials
- [ ] Change RabbitMQ credentials if deploying publicly
- [ ] Verify port numbers don't conflict with other services

!!! success "Ready to Launch"
    Once your `.env` is configured, you're ready to start the application!