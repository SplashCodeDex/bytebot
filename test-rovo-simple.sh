#!/bin/bash

echo "🎉 Testing Rovo AI Integration"
echo "=============================="
echo ""

# Start ByteBot Agent
echo "🚀 Starting ByteBot Agent..."
cd packages/bytebot-agent
npm run start &
AGENT_PID=$!

# Wait for service to start
echo "⏳ Waiting for service to start..."
sleep 30

# Test if service is running
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ ByteBot Agent is running!"
    
    # Create a Rovo AI task
    echo "🤖 Creating Rovo AI task..."
    curl -X POST http://localhost:3001/tasks \
        -H "Content-Type: application/json" \
        -d '{
            "description": "Test Rovo AI integration by taking a screenshot and analyzing the development environment",
            "model": {
                "provider": "rovo",
                "name": "rovo-dev-ai-v1"
            }
        }'
    
    echo ""
    echo "🎉 Rovo AI task created! Monitor at http://localhost:3000/tasks"
else
    echo "❌ Service failed to start"
    kill $AGENT_PID 2>/dev/null
fi