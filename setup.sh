#!/bin/bash

echo "Setting up monorepo..."

# Setup API
echo "Setting up FastAPI backend..."
cd api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

echo "Setup complete!"
echo "Run 'npm run dev' to start both the frontend and backend"
