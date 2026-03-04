FROM python:3.11-slim

WORKDIR /app

# System dependencies needed to compile psycopg2 and asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry (locked version for reproducibility)
RUN pip install --no-cache-dir poetry==1.8.2

# Tell Poetry NOT to create a virtual environment inside the container —
# we install directly into the system Python, which is simpler in Docker.
RUN poetry config virtualenvs.create false

# Copy dependency files first (layer-cached — only re-installs on toml/lock change)
COPY pyproject.toml poetry.lock* ./

# Install all deps (including dev for now; swap to --only=main for production)
RUN poetry install --no-interaction --no-ansi

# Copy application source
COPY . .

# Create directory for log files
RUN mkdir -p logs

EXPOSE 8000

# Default: production-style server. docker-compose.yml overrides with --reload for dev.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
