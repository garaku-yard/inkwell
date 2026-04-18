#!/bin/bash

# Inkwell AI Chat Service Startup Script

echo "Starting Inkwell AI Chat Service..."

# Check if virtual environment exists, create if not
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements
echo "Installing requirements..."
pip install -r requirements.txt

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
    echo "Please edit .env file with your API keys before running the service"
fi

# Start the service
echo "Starting AI Chat service on http://localhost:50054"
uvicorn main:app --host 0.0.0.0 --port 50054 --reload