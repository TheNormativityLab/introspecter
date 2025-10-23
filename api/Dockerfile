# Base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Ensure logs are printed in real-time
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Install OS dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends git curl build-essential && \
    rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

# Copy requirements first (for caching)
COPY requirements.txt .

# Install Python dependencies from requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the source code
COPY . .

# Expose port 3001
EXPOSE 3001

# Run FastAPI app
ENV PYTHONPATH=/app/src
CMD ["uvicorn", "src.api.gateway:app", "--host", "0.0.0.0", "--port", "3001", "--reload", "--reload-dir", "/app/src"]
