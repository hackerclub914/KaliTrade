#!/bin/bash

# GitHub Repository Setup Script for KaliTrade
# This script helps you create and push your repository to GitHub

echo "🚀 Setting up KaliTrade GitHub Repository"
echo "========================================"

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Please install it first:"
    echo "  macOS: brew install gh"
    echo "  Or download from: https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "🔐 Please authenticate with GitHub first:"
    gh auth login
fi

# Get repository name from user
read -p "📝 Enter your GitHub repository name (default: KaliTrade): " REPO_NAME
REPO_NAME=${REPO_NAME:-KaliTrade}

# Get repository description
read -p "📝 Enter repository description (default: Advanced AI-Powered Crypto Trading Platform): " REPO_DESC
REPO_DESC=${REPO_DESC:-"Advanced AI-Powered Crypto Trading Platform"}

# Ask if repository should be public or private
read -p "🔒 Make repository public? (y/n, default: y): " IS_PUBLIC
if [[ $IS_PUBLIC =~ ^[Nn]$ ]]; then
    VISIBILITY="private"
else
    VISIBILITY="public"
fi

echo ""
echo "📋 Repository Configuration:"
echo "  Name: $REPO_NAME"
echo "  Description: $REPO_DESC"
echo "  Visibility: $VISIBILITY"
echo ""

read -p "✅ Create repository with these settings? (y/n): " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "❌ Repository creation cancelled."
    exit 1
fi

# Create repository on GitHub
echo "🔄 Creating repository on GitHub..."
gh repo create "$REPO_NAME" --description "$REPO_DESC" --$VISIBILITY --source=. --remote=origin --push

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Repository created successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Visit your repository: https://github.com/$(gh api user --jq .login)/$REPO_NAME"
    echo "  2. Add topics/tags to your repository"
    echo "  3. Enable GitHub Pages if you want to host the demo"
    echo "  4. Set up GitHub Actions for CI/CD"
    echo "  5. Add collaborators if needed"
    echo ""
    echo "🔗 Repository URL: https://github.com/$(gh api user --jq .login)/$REPO_NAME"
else
    echo "❌ Failed to create repository. Please check your GitHub authentication and try again."
    exit 1
fi
