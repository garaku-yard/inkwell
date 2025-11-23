#!/bin/bash

# Test script for collaboration endpoints
echo "Testing Scriptlith Collaboration API"
echo "===================================="

# Step 1: Login to get JWT token
echo "1. Attempting login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8080/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lira@hotmail.com","password":"Lira0203!!@@"}')

echo "Login response: $LOGIN_RESPONSE"

# Extract token from response (assuming JSON format)
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not extract token from login response"
  echo "Response was: $LOGIN_RESPONSE"
  exit 1
fi

echo "Token extracted: ${TOKEN:0:20}..."

# Step 2: Test collaboration endpoint with valid token
echo "2. Testing collaboration endpoint with token..."
COLLAB_RESPONSE=$(curl -s -X POST http://localhost:8080/collaborators/username-tag \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "project_id": "123e4567-e89b-12d3-a456-426614174001",
    "username_tag": "l1roii#47382",
    "role": "editor"
  }' \
  -w "HTTP_CODE:%{http_code}")

echo "Collaboration response: $COLLAB_RESPONSE"

# Step 3: Test without token for comparison
echo "3. Testing without token (should fail with 401)..."
NO_AUTH_RESPONSE=$(curl -s -X POST http://localhost:8080/collaborators/username-tag \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "123e4567-e89b-12d3-a456-426614174001", 
    "username_tag": "l1roii#47382",
    "role": "editor"
  }' \
  -w "HTTP_CODE:%{http_code}")

echo "No auth response: $NO_AUTH_RESPONSE"

echo "Test completed!"