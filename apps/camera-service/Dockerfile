# Camera Service Dockerfile
# Provides containerized camera control via gPhoto2

FROM python:3.10-slim

# Install system dependencies for gPhoto2
RUN apt-get update && apt-get install -y \
    libgphoto2-dev \
    libexif-dev \
    libltdl7 \
    libjpeg-dev \
    zlib1g-dev \
    gcc \
    udev \
    usbutils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for photos and temp with proper permissions
RUN mkdir -p /app/photos /app/temp && chmod 755 /app/photos /app/temp

# Expose port
EXPOSE 8080

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV CONFIG_PATH=/app/config/camera.yaml

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')" || exit 1

# Run the application
CMD ["python", "main.py"]
