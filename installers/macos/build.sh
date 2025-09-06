#!/bin/bash
# Canvas CLI macOS Package Builder
# Creates .pkg installer for macOS

set -e

VERSION="${1:-2.0.0}"
IDENTIFIER="com.canvas-cli.cli"
INSTALL_LOCATION="/usr/local/canvas-cli"
OUTPUT_DIR="./output"

echo "Canvas CLI macOS Package Builder v$VERSION"
echo "=========================================="

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "✗ Node.js not found. Please install Node.js 20+"
    exit 1
fi
echo "✓ Node.js found: $(node --version)"

if ! command -v pkgbuild &> /dev/null; then
    echo "✗ pkgbuild not found. Please install Xcode Command Line Tools"
    exit 1
fi
echo "✓ pkgbuild found"

# Build application
echo -e "\nBuilding Canvas CLI..."
cd ../..
npm ci --production
npm run build

# Create pkg structure
echo "Creating package structure..."
mkdir -p installers/macos/build/usr/local/canvas-cli
mkdir -p installers/macos/build/usr/local/bin
mkdir -p installers/macos/scripts

# Copy files
cp -R dist/* installers/macos/build/usr/local/canvas-cli/
cp -R node_modules installers/macos/build/usr/local/canvas-cli/
cp package.json installers/macos/build/usr/local/canvas-cli/
cp README.md installers/macos/build/usr/local/canvas-cli/
cp LICENSE installers/macos/build/usr/local/canvas-cli/

# Create symlink script
cat > installers/macos/scripts/postinstall << 'EOF'
#!/bin/bash
# Create symlink for canvas command
ln -sf /usr/local/canvas-cli/dist/index.js /usr/local/bin/canvas
chmod +x /usr/local/bin/canvas

# Create config directory
mkdir -p "$HOME/.canvas-cli"

# Initialize default config if not exists
if [ ! -f "$HOME/.canvas-cli/config.json" ]; then
    cat > "$HOME/.canvas-cli/config.json" << 'CONFIG'
{
  "defaultProvider": "ollama",
  "defaultModel": "llama3.2",
  "providers": {
    "ollama": {
      "enabled": true
    }
  }
}
CONFIG
fi

# Set up shell completions
COMPLETION_DIR="/usr/local/canvas-cli/completions"
if [ -d "$COMPLETION_DIR" ]; then
    # Bash
    if [ -d "/usr/local/etc/bash_completion.d" ]; then
        ln -sf "$COMPLETION_DIR/canvas.bash" "/usr/local/etc/bash_completion.d/canvas"
    fi
    
    # Zsh
    if [ -d "/usr/local/share/zsh/site-functions" ]; then
        ln -sf "$COMPLETION_DIR/canvas.zsh" "/usr/local/share/zsh/site-functions/_canvas"
    fi
    
    # Fish
    if [ -d "/usr/local/share/fish/vendor_completions.d" ]; then
        ln -sf "$COMPLETION_DIR/canvas.fish" "/usr/local/share/fish/vendor_completions.d/canvas.fish"
    fi
fi

echo "Canvas CLI has been installed successfully!"
echo "Run 'canvas' to get started"
EOF

chmod +x installers/macos/scripts/postinstall

# Create uninstall script
cat > installers/macos/scripts/uninstall.sh << 'EOF'
#!/bin/bash
# Canvas CLI Uninstaller for macOS

echo "Uninstalling Canvas CLI..."

# Remove installation
sudo rm -rf /usr/local/canvas-cli
sudo rm -f /usr/local/bin/canvas

# Remove completions
sudo rm -f /usr/local/etc/bash_completion.d/canvas
sudo rm -f /usr/local/share/zsh/site-functions/_canvas
sudo rm -f /usr/local/share/fish/vendor_completions.d/canvas.fish

# Ask about config removal
read -p "Remove configuration files? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$HOME/.canvas-cli"
fi

echo "Canvas CLI has been uninstalled."
EOF

chmod +x installers/macos/scripts/uninstall.sh
cp installers/macos/scripts/uninstall.sh installers/macos/build/usr/local/canvas-cli/

# Build component package
echo -e "\nBuilding component package..."
cd installers/macos
mkdir -p "$OUTPUT_DIR"

pkgbuild --root build \
         --identifier "$IDENTIFIER" \
         --version "$VERSION" \
         --scripts scripts \
         --install-location "/" \
         "$OUTPUT_DIR/canvas-cli-component.pkg"

# Create distribution XML
cat > distribution.xml << EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2.0">
    <title>Canvas CLI</title>
    <organization>com.canvas-cli</organization>
    <domains enable_anywhere="true"/>
    <options customize="never" require-scripts="true" rootVolumeOnly="true"/>
    <license file="../../LICENSE"/>
    <readme file="../../README.md"/>
    <background file="resources/background.png" alignment="bottomleft" scaling="none"/>
    <welcome file="resources/welcome.html"/>
    <conclusion file="resources/conclusion.html"/>
    
    <pkg-ref id="$IDENTIFIER">
        <bundle-version/>
    </pkg-ref>
    
    <choices-outline>
        <line choice="default">
            <line choice="$IDENTIFIER"/>
        </line>
    </choices-outline>
    
    <choice id="default"/>
    <choice id="$IDENTIFIER" visible="false">
        <pkg-ref id="$IDENTIFIER"/>
    </choice>
    
    <pkg-ref id="$IDENTIFIER" version="$VERSION" onConclusion="none">canvas-cli-component.pkg</pkg-ref>
</installer-gui-script>
EOF

# Create resources
mkdir -p resources

cat > resources/welcome.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }
        h1 { color: #333; }
        p { color: #666; line-height: 1.6; }
        .feature { margin: 10px 0; }
        .icon { display: inline-block; width: 20px; }
    </style>
</head>
<body>
    <h1>Welcome to Canvas CLI</h1>
    <p>AI Coding Assistant in Your Terminal</p>
    
    <div class="feature">
        <span class="icon">🚀</span> Lightning fast local AI processing
    </div>
    <div class="feature">
        <span class="icon">🔒</span> 100% private and secure
    </div>
    <div class="feature">
        <span class="icon">💻</span> Full code understanding
    </div>
    <div class="feature">
        <span class="icon">🎯</span> Production-ready features
    </div>
    
    <p>This installer will guide you through the installation process.</p>
</body>
</html>
EOF

cat > resources/conclusion.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }
        h1 { color: #333; }
        p { color: #666; line-height: 1.6; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>Installation Complete!</h1>
    
    <p>Canvas CLI has been successfully installed.</p>
    
    <p>To get started, open Terminal and run:</p>
    <p><code>canvas</code></p>
    
    <p>Or use directly:</p>
    <p><code>canvas chat "Help me write a function"</code></p>
    
    <p>For documentation, visit: <a href="https://docs.canvas-cli.com">docs.canvas-cli.com</a></p>
</body>
</html>
EOF

# Build distribution package
echo "Building distribution package..."
productbuild --distribution distribution.xml \
             --package-path "$OUTPUT_DIR" \
             --resources resources \
             "$OUTPUT_DIR/canvas-cli-$VERSION.pkg"

# Sign if certificate available
if [ -n "$DEVELOPER_ID" ]; then
    echo "Signing package..."
    productsign --sign "Developer ID Installer: $DEVELOPER_ID" \
                "$OUTPUT_DIR/canvas-cli-$VERSION.pkg" \
                "$OUTPUT_DIR/canvas-cli-$VERSION-signed.pkg"
    mv "$OUTPUT_DIR/canvas-cli-$VERSION-signed.pkg" "$OUTPUT_DIR/canvas-cli-$VERSION.pkg"
    echo "✓ Package signed"
fi

# Create DMG with drag-to-Applications
echo -e "\nCreating DMG..."
mkdir -p dmg
cp "$OUTPUT_DIR/canvas-cli-$VERSION.pkg" dmg/
cp scripts/uninstall.sh dmg/
ln -s /Applications dmg/Applications

hdiutil create -volname "Canvas CLI $VERSION" \
               -srcfolder dmg \
               -ov \
               -format UDZO \
               "$OUTPUT_DIR/canvas-cli-$VERSION.dmg"

# Generate checksums
echo -e "\nGenerating checksums..."
cd "$OUTPUT_DIR"
shasum -a 256 "canvas-cli-$VERSION.pkg" > checksums.txt
shasum -a 256 "canvas-cli-$VERSION.dmg" >> checksums.txt

# Clean up
cd ..
rm -rf build dmg
rm -f "$OUTPUT_DIR/canvas-cli-component.pkg"

echo -e "\n✓ Build complete!"
echo "Outputs:"
echo "  - PKG: $OUTPUT_DIR/canvas-cli-$VERSION.pkg"
echo "  - DMG: $OUTPUT_DIR/canvas-cli-$VERSION.dmg"
echo "  - Checksums: $OUTPUT_DIR/checksums.txt"