#!/bin/bash

# KaliTrade - Unified Crypto Trading Platform Startup Script
# This script starts all components of the KaliTrade platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}================================${NC}"
}

# Check if Node.js is installed
check_nodejs() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    print_status "Node.js version: $(node --version)"
}

# Check if Python is installed
check_python() {
    if ! command -v python3 &> /dev/null; then
        print_warning "Python3 is not installed. Trading bot will be disabled."
        return 1
    fi
    print_status "Python version: $(python3 --version)"
    return 0
}

# Install backend dependencies
install_backend_deps() {
    print_status "Installing backend dependencies..."
    cd backend
    if [ ! -d "node_modules" ]; then
        npm install
    else
        print_status "Backend dependencies already installed"
    fi
    cd ..
}

# Install frontend dependencies
install_frontend_deps() {
    print_status "Installing frontend dependencies..."
    cd frontend
    if [ ! -d "node_modules" ]; then
        npm install
    else
        print_status "Frontend dependencies already installed"
    fi
    cd ..
}

# Install trading bot dependencies
install_trading_bot_deps() {
    if check_python; then
        print_status "Installing trading bot dependencies..."
        cd trading-bot
        if [ ! -d "venv" ]; then
            print_status "Creating Python virtual environment..."
            python3 -m venv venv
        fi
        
        print_status "Activating virtual environment and installing dependencies..."
        source venv/bin/activate
        pip install -r requirements.txt
        cd ..
    else
        print_warning "Skipping trading bot dependencies (Python not available)"
    fi
}

# Build backend
build_backend() {
    print_status "Building backend..."
    cd backend
    npm run build
    cd ..
}

# Start the unified application
start_app() {
    print_status "Starting KaliTrade Unified Platform..."
    
    # Make app.js executable
    chmod +x app.js
    
    # Start the application
    node app.js start
}

# Main execution
main() {
    print_header "🚀 KaliTrade - Unified Crypto Trading Platform"
    
    print_status "Checking system requirements..."
    check_nodejs
    check_python
    
    print_status "Installing dependencies..."
    install_backend_deps
    install_frontend_deps
    install_trading_bot_deps
    
    print_status "Building application..."
    build_backend
    
    print_header "🌟 Starting KaliTrade Platform"
    start_app
}

# Handle script interruption
trap 'print_error "Script interrupted. Stopping..."; exit 1' INT

# Run main function
main "$@"
