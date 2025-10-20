#!/bin/bash

# Kaiban Markdown - Complete Reinstall Script for Cursor
# This script will clean, compile, package, and reinstall the extension

set -e  # Exit on error

echo "🧹 Cleaning old build..."
rm -rf out/
rm -f *.vsix

echo "📦 Installing dependencies..."
pnpm install

echo "🔨 Compiling TypeScript..."
pnpm run compile

echo "📦 Packaging extension..."
pnpm run package

echo "✅ Extension packaged successfully!"
echo ""
echo "📋 To install in Cursor:"
echo "   1. Press Cmd+Shift+P in Cursor"
echo "   2. Type: 'Extensions: Install from VSIX...'"
echo "   3. Select the .vsix file in this directory"
echo "   4. Reload Cursor window"
echo ""
echo "🎉 Package ready: $(ls -1 *.vsix)"

