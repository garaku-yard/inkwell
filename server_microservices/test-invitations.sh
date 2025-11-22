#!/bin/bash

# Test script for collaboration invitation system
# Make sure the services are running before executing this script

API_URL="http://localhost:8080"
USER_ID="00000000-0000-0000-0000-000000000000" # Test user ID
PROJECT_ID="11111111-1111-1111-1111-111111111111" # Test project ID

echo "🚀 Testing Collaboration Invitation System"
echo "=========================================="

# Test 1: Add Collaborator (Send Invitation)
echo "📧 Test 1: Sending invitation..."
INVITE_RESPONSE=$(curl -s -X POST ${API_URL}/collaborators \
  -H "Content-Type: application/json" \
  -H "X-User-ID: ${USER_ID}" \
  -d '{
    "project_id": "'${PROJECT_ID}'",
    "email": "newuser@example.com",
    "role": "editor"
  }')

echo "Response: $INVITE_RESPONSE"
echo ""

# Test 2: Get User Invitations
echo "📋 Test 2: Getting user invitations..."
INVITATIONS_RESPONSE=$(curl -s -X GET ${API_URL}/invitations \
  -H "X-User-ID: ${USER_ID}")

echo "Response: $INVITATIONS_RESPONSE"
echo ""

# Test 3: Accept Invitation (using dummy collaborator ID)
echo "✅ Test 3: Accepting invitation..."
ACCEPT_RESPONSE=$(curl -s -X POST ${API_URL}/invitations/accept \
  -H "Content-Type: application/json" \
  -H "X-User-ID: ${USER_ID}" \
  -d '{
    "collaborator_id": "22222222-2222-2222-2222-222222222222"
  }')

echo "Response: $ACCEPT_RESPONSE"
echo ""

# Test 4: Decline Invitation (using dummy collaborator ID)  
echo "❌ Test 4: Declining invitation..."
DECLINE_RESPONSE=$(curl -s -X POST ${API_URL}/invitations/decline \
  -H "Content-Type: application/json" \
  -H "X-User-ID: ${USER_ID}" \
  -d '{
    "collaborator_id": "33333333-3333-3333-3333-333333333333"
  }')

echo "Response: $DECLINE_RESPONSE"
echo ""

# Test 5: Get Project Collaborators
echo "👥 Test 5: Getting project collaborators..."
COLLABORATORS_RESPONSE=$(curl -s -X GET "${API_URL}/collaborators?project_id=${PROJECT_ID}" \
  -H "X-User-ID: ${USER_ID}")

echo "Response: $COLLABORATORS_RESPONSE"
echo ""

echo "🎉 All tests completed!"
echo ""
echo "Next steps:"
echo "1. Start the services: ./start-services.sh"
echo "2. Run this script: ./test-invitations.sh"
echo "3. Check the responses for expected JSON structure"
echo "4. Integrate these endpoints in your client application"