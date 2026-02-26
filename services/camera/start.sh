#!/bin/bash

# Start Python Camera Service

cd "$(dirname "$0")"

# Check for virtual environment
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3.11 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Create photos directory
mkdir -p photos
mkdir -p tmp

# Start the service
echo "Starting Camera Service on port 8000..."
python -m src.main
