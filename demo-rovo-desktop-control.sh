#!/bin/bash

# 🚀 ByteBot + Rovo AI Desktop Control Demonstration Script
# This script demonstrates the complete integration and capabilities

set -e

echo "🎉 ByteBot + Rovo AI Desktop Control Demo"
echo "=========================================="
echo ""

# Configuration
BYTEBOT_API="http://localhost:3001"
BYTEBOT_UI="http://localhost:3000"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if services are running
check_services() {
    print_step "Checking ByteBot services..."
    
    # Check if ByteBot Agent is running
    if curl -s "$BYTEBOT_API/health" > /dev/null 2>&1; then
        print_success "ByteBot Agent is running on $BYTEBOT_API"
    else
        print_error "ByteBot Agent is not running. Please start it with: cd packages/bytebot-agent && npm run start"
        exit 1
    fi
    
    # Check if ByteBot UI is accessible
    if curl -s "$BYTEBOT_UI" > /dev/null 2>&1; then
        print_success "ByteBot UI is accessible at $BYTEBOT_UI"
    else
        print_warning "ByteBot UI may not be running. Start with: cd packages/bytebot-ui && npm run dev"
    fi
    
    echo ""
}

# Show available test scenarios
show_test_scenarios() {
    print_step "Available Rovo AI Desktop Control Test Scenarios:"
    echo ""
    
    curl -s "$BYTEBOT_API/test-scenarios" | jq -r '.scenarios[] | "🔧 \(.name)\n   📝 \(.description)\n"'
    echo ""
}

# Execute quick demo
execute_quick_demo() {
    print_step "Executing Rovo AI Desktop Control Quick Demo..."
    echo ""
    
    response=$(curl -s -X POST "$BYTEBOT_API/test-scenarios/quick-demo")
    
    if echo "$response" | jq -e '.success' > /dev/null; then
        task_id=$(echo "$response" | jq -r '.taskId')
        monitor_url=$(echo "$response" | jq -r '.monitorUrl')
        
        print_success "Demo started successfully!"
        echo ""
        echo -e "${GREEN}🎮 Task ID: $task_id${NC}"
        echo -e "${GREEN}🔗 Monitor URL: $monitor_url${NC}"
        echo ""
        
        echo -e "${BLUE}📋 What Rovo AI will do:${NC}"
        echo "$response" | jq -r '.expectedBehavior[]' | sed 's/^/   /'
        echo ""
        
        echo -e "${BLUE}📋 Instructions:${NC}"
        echo "$response" | jq -r '.instructions[]' | sed 's/^/   /'
        echo ""
        
        return 0
    else
        error_msg=$(echo "$response" | jq -r '.error // "Unknown error"')
        print_error "Demo failed: $error_msg"
        return 1
    fi
}

# Execute specific test scenario
execute_test_scenario() {
    local scenario_id="$1"
    
    print_step "Executing test scenario: $scenario_id"
    
    response=$(curl -s -X POST "$BYTEBOT_API/test-scenarios/execute/$scenario_id")
    
    if echo "$response" | jq -e '.success' > /dev/null; then
        task_id=$(echo "$response" | jq -r '.taskId')
        monitor_url=$(echo "$response" | jq -r '.monitorUrl')
        
        print_success "Test scenario started!"
        echo -e "${GREEN}🎮 Task ID: $task_id${NC}"
        echo -e "${GREEN}🔗 Monitor URL: $monitor_url${NC}"
        echo ""
        
        return 0
    else
        error_msg=$(echo "$response" | jq -r '.error // "Unknown error"')
        print_error "Test scenario failed: $error_msg"
        return 1
    fi
}

# Execute all test scenarios
execute_all_scenarios() {
    print_step "Executing ALL Rovo AI test scenarios..."
    echo ""
    
    response=$(curl -s -X POST "$BYTEBOT_API/test-scenarios/execute-all")
    
    if echo "$response" | jq -e '.success' > /dev/null; then
        print_success "All test scenarios started!"
        echo ""
        
        echo -e "${BLUE}📋 Results:${NC}"
        echo "$response" | jq -r '.results | to_entries[] | "   🎮 \(.key): \(.value)"'
        echo ""
        
        monitor_url=$(echo "$response" | jq -r '.monitorUrl')
        echo -e "${GREEN}🔗 Monitor all tasks: $monitor_url${NC}"
        echo ""
        
        return 0
    else
        error_msg=$(echo "$response" | jq -r '.error // "Unknown error"')
        print_error "Failed to start all scenarios: $error_msg"
        return 1
    fi
}

# Execute workflow test
execute_workflow_test() {
    local workflow_id="$1"
    
    print_step "Executing workflow: $workflow_id"
    
    response=$(curl -s -X POST "$BYTEBOT_API/test-scenarios/workflow/$workflow_id" \
        -H "Content-Type: application/json" \
        -d '{"project_path": "./", "review_depth": "comprehensive", "include_tests": true}')
    
    if echo "$response" | jq -e '.success' > /dev/null; then
        execution_id=$(echo "$response" | jq -r '.executionId')
        monitor_url=$(echo "$response" | jq -r '.monitorUrl')
        
        print_success "Workflow started!"
        echo -e "${GREEN}🎮 Execution ID: $execution_id${NC}"
        echo -e "${GREEN}🔗 Monitor URL: $monitor_url${NC}"
        echo ""
        
        return 0
    else
        error_msg=$(echo "$response" | jq -r '.error // "Unknown error"')
        print_error "Workflow failed: $error_msg"
        return 1
    fi
}

# Main menu
show_menu() {
    echo -e "${BLUE}🎮 Choose a demonstration:${NC}"
    echo ""
    echo "1) 🚀 Quick Demo (Basic Code Analysis)"
    echo "2) 🔧 Specific Test Scenario"
    echo "3) 🌟 All Test Scenarios"
    echo "4) 🔄 Workflow Demo"
    echo "5) 📊 View Test Scenarios"
    echo "6) 🌐 Open ByteBot UI"
    echo "7) ❌ Exit"
    echo ""
    echo -n "Enter your choice (1-7): "
}

# Open ByteBot UI
open_ui() {
    print_step "Opening ByteBot UI..."
    
    if command -v xdg-open > /dev/null; then
        xdg-open "$BYTEBOT_UI"
    elif command -v open > /dev/null; then
        open "$BYTEBOT_UI"
    else
        echo -e "${YELLOW}Please open $BYTEBOT_UI in your browser${NC}"
    fi
    
    print_success "ByteBot UI should now be open in your browser"
}

# Main execution
main() {
    echo "🎯 Starting ByteBot + Rovo AI Desktop Control Demo..."
    echo ""
    
    # Check if required tools are available
    if ! command -v curl > /dev/null; then
        print_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq > /dev/null; then
        print_error "jq is required but not installed. Please install jq to run this demo."
        exit 1
    fi
    
    # Check services
    check_services
    
    # Main loop
    while true; do
        show_menu
        read -r choice
        echo ""
        
        case $choice in
            1)
                execute_quick_demo
                echo ""
                print_step "Press Enter to continue..."
                read -r
                ;;
            2)
                show_test_scenarios
                echo -n "Enter scenario ID (e.g., rovo-code-analysis-basic): "
                read -r scenario_id
                echo ""
                execute_test_scenario "$scenario_id"
                echo ""
                print_step "Press Enter to continue..."
                read -r
                ;;
            3)
                execute_all_scenarios
                echo ""
                print_step "Press Enter to continue..."
                read -r
                ;;
            4)
                echo "Available workflows:"
                echo "  • rovo-code-review-automated"
                echo "  • rovo-bug-hunting-pipeline"
                echo "  • rovo-feature-development-pipeline"
                echo "  • rovo-performance-optimization"
                echo ""
                echo -n "Enter workflow ID: "
                read -r workflow_id
                echo ""
                execute_workflow_test "$workflow_id"
                echo ""
                print_step "Press Enter to continue..."
                read -r
                ;;
            5)
                show_test_scenarios
                print_step "Press Enter to continue..."
                read -r
                ;;
            6)
                open_ui
                echo ""
                print_step "Press Enter to continue..."
                read -r
                ;;
            7)
                print_success "Thanks for trying ByteBot + Rovo AI! 🚀"
                exit 0
                ;;
            *)
                print_error "Invalid choice. Please try again."
                echo ""
                ;;
        esac
    done
}

# Run main function
main "$@"