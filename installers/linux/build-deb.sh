#!/bin/bash
# Canvas CLI Debian/Ubuntu Package Builder (.deb)

set -e

VERSION="${1:-2.0.0}"
ARCH="amd64"
PACKAGE_NAME="canvas-cli"
OUTPUT_DIR="./output"

echo "Canvas CLI Debian Package Builder v$VERSION"
echo "==========================================="

# Build application
echo "Building Canvas CLI..."
cd ../..
npm ci --production
npm run build

# Create debian package structure
echo "Creating package structure..."
cd installers/linux
mkdir -p "$PACKAGE_NAME-$VERSION/DEBIAN"
mkdir -p "$PACKAGE_NAME-$VERSION/usr/local/bin"
mkdir -p "$PACKAGE_NAME-$VERSION/usr/local/lib/canvas-cli"
mkdir -p "$PACKAGE_NAME-$VERSION/usr/share/applications"
mkdir -p "$PACKAGE_NAME-$VERSION/usr/share/doc/canvas-cli"
mkdir -p "$PACKAGE_NAME-$VERSION/usr/share/bash-completion/completions"
mkdir -p "$PACKAGE_NAME-$VERSION/usr/share/zsh/vendor-completions"
mkdir -p "$PACKAGE_NAME-$VERSION/usr/share/fish/vendor_completions.d"
mkdir -p "$PACKAGE_NAME-$VERSION/etc/canvas-cli"

# Copy application files
cp -R ../../dist/* "$PACKAGE_NAME-$VERSION/usr/local/lib/canvas-cli/"
cp -R ../../node_modules "$PACKAGE_NAME-$VERSION/usr/local/lib/canvas-cli/"
cp ../../package.json "$PACKAGE_NAME-$VERSION/usr/local/lib/canvas-cli/"
cp ../../README.md "$PACKAGE_NAME-$VERSION/usr/share/doc/canvas-cli/"
cp ../../LICENSE "$PACKAGE_NAME-$VERSION/usr/share/doc/canvas-cli/"

# Create executable wrapper
cat > "$PACKAGE_NAME-$VERSION/usr/local/bin/canvas" << 'EOF'
#!/bin/bash
export NODE_PATH=/usr/local/lib/canvas-cli/node_modules
exec /usr/bin/node /usr/local/lib/canvas-cli/dist/index.js "$@"
EOF
chmod +x "$PACKAGE_NAME-$VERSION/usr/local/bin/canvas"

# Create control file
cat > "$PACKAGE_NAME-$VERSION/DEBIAN/control" << EOF
Package: canvas-cli
Version: $VERSION
Section: devel
Priority: optional
Architecture: $ARCH
Depends: nodejs (>= 20.0.0), npm
Recommends: git, python3 (>= 3.8)
Suggests: ollama
Maintainer: Canvas CLI Team <support@canvas-cli.com>
Homepage: https://canvas-cli.com
Description: AI Coding Assistant in Your Terminal
 Canvas CLI is a production-ready AI command-line interface that combines
 the best features from leading AI tools with production-ready architecture.
 Built with TypeScript and featuring advanced tokenization, tool monitoring,
 context management, and workflow automation.
 .
 Features:
  - Multiple AI provider support (Ollama, OpenAI, Anthropic, Google)
  - Advanced context management with automatic compression
  - 50+ built-in tools for development workflows
  - Recipe system for workflow automation
  - Full VS Code and GitHub integration
EOF

# Create postinst script
cat > "$PACKAGE_NAME-$VERSION/DEBIAN/postinst" << 'EOF'
#!/bin/bash
set -e

# Create config directory
mkdir -p /etc/canvas-cli
mkdir -p "$HOME/.canvas-cli"

# Initialize default configuration
if [ ! -f "$HOME/.canvas-cli/config.json" ]; then
    cat > "$HOME/.canvas-cli/config.json" << 'CONFIG'
{
  "defaultProvider": "ollama",
  "defaultModel": "llama3.2",
  "providers": {
    "ollama": {
      "enabled": true,
      "baseUrl": "http://localhost:11434"
    }
  }
}
CONFIG
    chmod 644 "$HOME/.canvas-cli/config.json"
fi

# Set up completions
if [ -f /usr/local/lib/canvas-cli/completions/canvas.bash ]; then
    ln -sf /usr/local/lib/canvas-cli/completions/canvas.bash \
           /usr/share/bash-completion/completions/canvas
fi

if [ -f /usr/local/lib/canvas-cli/completions/canvas.zsh ]; then
    ln -sf /usr/local/lib/canvas-cli/completions/canvas.zsh \
           /usr/share/zsh/vendor-completions/_canvas
fi

if [ -f /usr/local/lib/canvas-cli/completions/canvas.fish ]; then
    ln -sf /usr/local/lib/canvas-cli/completions/canvas.fish \
           /usr/share/fish/vendor_completions.d/canvas.fish
fi

echo "Canvas CLI has been installed successfully!"
echo "Run 'canvas' to get started"
echo ""
echo "To use with Ollama, ensure it's running:"
echo "  ollama serve"
echo ""
echo "For other providers, set your API keys:"
echo "  export OPENAI_API_KEY='your-key'"
echo "  export ANTHROPIC_API_KEY='your-key'"

exit 0
EOF
chmod 755 "$PACKAGE_NAME-$VERSION/DEBIAN/postinst"

# Create prerm script
cat > "$PACKAGE_NAME-$VERSION/DEBIAN/prerm" << 'EOF'
#!/bin/bash
set -e

# Remove completion symlinks
rm -f /usr/share/bash-completion/completions/canvas
rm -f /usr/share/zsh/vendor-completions/_canvas
rm -f /usr/share/fish/vendor_completions.d/canvas.fish

exit 0
EOF
chmod 755 "$PACKAGE_NAME-$VERSION/DEBIAN/prerm"

# Create desktop entry
cat > "$PACKAGE_NAME-$VERSION/usr/share/applications/canvas-cli.desktop" << EOF
[Desktop Entry]
Name=Canvas CLI
Comment=AI Coding Assistant in Your Terminal
Exec=canvas
Icon=canvas-cli
Terminal=true
Type=Application
Categories=Development;IDE;
Keywords=ai;llm;coding;assistant;ollama;development;
EOF

# Create default config
cat > "$PACKAGE_NAME-$VERSION/etc/canvas-cli/default.json" << 'EOF'
{
  "defaultProvider": "ollama",
  "defaultModel": "llama3.2",
  "providers": {
    "ollama": {
      "enabled": true,
      "timeout": 30000
    },
    "openai": {
      "enabled": false,
      "apiKey": "",
      "model": "gpt-4"
    },
    "anthropic": {
      "enabled": false,
      "apiKey": "",
      "model": "claude-3-opus-20240229"
    }
  },
  "context": {
    "compressionEnabled": true,
    "strategy": "smart_trim",
    "targetUtilization": 0.8
  },
  "monitoring": {
    "enabled": true,
    "maxToolCalls": 100,
    "repetitionThreshold": 3
  }
}
EOF

# Build the package
echo "Building DEB package..."
mkdir -p "$OUTPUT_DIR"
dpkg-deb --build "$PACKAGE_NAME-$VERSION" "$OUTPUT_DIR/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

# Create APT repository structure (optional)
echo "Creating APT repository files..."
mkdir -p "$OUTPUT_DIR/apt/pool/main/c/canvas-cli"
mkdir -p "$OUTPUT_DIR/apt/dists/stable/main/binary-$ARCH"
cp "$OUTPUT_DIR/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb" \
   "$OUTPUT_DIR/apt/pool/main/c/canvas-cli/"

# Generate Packages file
cd "$OUTPUT_DIR/apt"
dpkg-scanpackages pool/main > dists/stable/main/binary-$ARCH/Packages
gzip -c dists/stable/main/binary-$ARCH/Packages > \
     dists/stable/main/binary-$ARCH/Packages.gz

# Create Release file
cat > dists/stable/Release << EOF
Origin: Canvas CLI
Label: Canvas CLI
Suite: stable
Codename: stable
Version: $VERSION
Architectures: $ARCH
Components: main
Description: Canvas CLI APT Repository
Date: $(date -R)
EOF

# Generate checksums
cd ../..
echo "Generating checksums..."
sha256sum "$OUTPUT_DIR/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb" > "$OUTPUT_DIR/checksums.txt"

# Clean up
rm -rf "$PACKAGE_NAME-$VERSION"

echo -e "\n✓ Build complete!"
echo "Outputs:"
echo "  - DEB: $OUTPUT_DIR/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"
echo "  - APT Repo: $OUTPUT_DIR/apt/"
echo "  - Checksums: $OUTPUT_DIR/checksums.txt"
echo ""
echo "To install:"
echo "  sudo dpkg -i $OUTPUT_DIR/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"
echo "  sudo apt-get install -f  # Install dependencies if needed"