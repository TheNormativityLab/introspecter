#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

services=(
    "introspecter-api:3000:API Backend"
    "introspecter-backend:8000:Backend Service"
    "introspecter-frontend:5173:Frontend"
    "introspecter-celery-worker::Celery Worker"
    "introspecter-flower:5555:Flower UI"
    "introspecter-rabbitmq:15672:RabbitMQ"
    "introspecter-postgres-api:5433:PostgreSQL (API)"
    "introspecter-postgres-backend:5434:PostgreSQL (Backend)"
)

for service in "${services[@]}"; do
    IFS=':' read -r container port name <<< "$service"
    
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        if [ -n "$port" ]; then
            echo -e "${GREEN}✓${NC} $name - ${YELLOW}http://localhost:$port${NC}"
        else
            echo -e "${GREEN}✓${NC} $name - Running"
        fi
    else
        echo -e "${RED}✗${NC} $name - Not running"
    fi
done

echo ""
echo "========================================"
echo "Workspace locations:"
echo "  API:      /workspace/api"
echo "  Frontend: /workspace/frontend"
echo "  Backend:  /workspace/backend"
echo "========================================"