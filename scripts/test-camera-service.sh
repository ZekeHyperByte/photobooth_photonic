#!/bin/bash

# Camera Service Integration Test Script
# Tests the Python camera service endpoints

set -e

echo "======================================"
echo "Camera Service Integration Test"
echo "======================================"

SERVICE_URL="http://localhost:8000"

echo ""
echo "1. Testing health endpoint..."
curl -s ${SERVICE_URL}/health | jq .

echo ""
echo "2. Connecting to camera..."
curl -s -X POST ${SERVICE_URL}/api/v1/camera/connect | jq .

echo ""
echo "3. Getting camera status..."
curl -s ${SERVICE_URL}/api/v1/camera/status | jq .

echo ""
echo "4. Starting live view..."
curl -s -X POST ${SERVICE_URL}/api/v1/camera/liveview/start | jq .

echo ""
echo "5. Getting status (live view should be active)..."
curl -s ${SERVICE_URL}/api/v1/camera/status | jq .

echo ""
echo "6. Testing capture..."
curl -s -X POST ${SERVICE_URL}/api/v1/camera/capture \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session-001",
    "sequence_number": 1,
    "output_directory": "./test-photos"
  }' | jq .

echo ""
echo "7. Stopping live view..."
curl -s -X POST ${SERVICE_URL}/api/v1/camera/liveview/stop | jq .

echo ""
echo "8. Disconnecting camera..."
curl -s -X POST ${SERVICE_URL}/api/v1/camera/disconnect | jq .

echo ""
echo "======================================"
echo "Integration test completed!"
echo "======================================"
