# Camera Service Dockerfile
FROM python:3.11-slim

# Install system dependencies for gphoto2
RUN apt-get update && apt-get install -y \
    gphoto2 \
    libgphoto2-dev \
    libgphoto2-port12 \
    libjpeg-dev \
    zlib1g-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for photos and temp
RUN mkdir -p /app/photos /app/temp

# Expose port
EXPOSE 8080

# Run the application
CMD ["python", "main.py"]
