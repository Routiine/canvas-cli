# Canvas CLI Installation Guide

## System Requirements

### Minimum Requirements
- **Node.js**: v20.0.0 or higher
- **RAM**: 4GB minimum, 8GB recommended
- **Disk Space**: 2GB for Canvas CLI + models
- **OS**: Windows 10+, macOS 11+, Ubuntu 20.04+

### Recommended Setup
- **Node.js**: v20.x LTS
- **RAM**: 16GB for optimal performance
- **GPU**: NVIDIA GPU with 8GB+ VRAM (for local models)
- **Network**: Stable internet for API providers

## Installation Methods

### 1. NPM Installation (Recommended)

```bash
# Global installation
npm install -g canvas-cli

# Verify installation
canvas --version
```

### 2. Direct from GitHub

```bash
# Clone repository
git clone https://github.com/canvas-cli/canvas-cli.git
cd canvas-cli

# Install dependencies
npm install

# Build from source
npm run build

# Link globally
npm link

# Verify
canvas --version
```

### 3. Docker Installation

```bash
# Pull official image
docker pull canvascli/canvas:latest

# Run with volume mount
docker run -it -v $(pwd):/workspace canvascli/canvas

# With Ollama support
docker run -it \
  -v $(pwd):/workspace \
  --network host \
  canvascli/canvas
```

### 4. Platform-Specific Installers

#### Windows
```powershell
# Using Chocolatey
choco install canvas-cli

# Using Scoop
scoop bucket add canvas-cli https://github.com/canvas-cli/scoop-bucket
scoop install canvas-cli
```

#### macOS
```bash
# Using Homebrew
brew tap canvas-cli/tap
brew install canvas-cli
```

#### Linux
```bash
# Ubuntu/Debian
curl -fsSL https://canvas-cli.dev/install.sh | bash

# Arch Linux (AUR)
yay -S canvas-cli

# Snap
snap install canvas-cli
```

## Initial Setup

### 1. First Run Configuration

```bash
# Run setup wizard
canvas config wizard

# This will:
# - Detect available providers
# - Configure default settings
# - Set up local directories
# - Test connectivity
```

### 2. Provider Setup

#### Ollama (Local AI)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
ollama serve

# Pull recommended models
ollama pull llama3.2
ollama pull codellama

# Configure Canvas CLI
canvas config set defaultProvider ollama
```

#### OpenAI
```bash
# Set API key
export OPENAI_API_KEY="sk-..."

# Configure
canvas config set defaultProvider openai
canvas config set providers.openai.apiKey $OPENAI_API_KEY
```

#### Anthropic
```bash
# Set API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Configure
canvas config set defaultProvider anthropic
```

### 3. Verify Installation

```bash
# Test configuration
canvas config test

# Run simple command
canvas chat "Hello, Canvas!"

# Check tool availability
canvas tools list
```

## Environment Setup

### Shell Configuration

#### Bash/Zsh
Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Canvas CLI environment
export CANVAS_CLI_HOME="$HOME/.canvas-cli"
export PATH="$CANVAS_CLI_HOME/bin:$PATH"

# API Keys (optional)
export OPENAI_API_KEY="your-key"
export ANTHROPIC_API_KEY="your-key"

# Aliases
alias cc="canvas chat"
alias ci="canvas init"
alias cr="canvas recipe"

# Auto-completion
source <(canvas completion bash)
```

#### PowerShell
Add to `$PROFILE`:

```powershell
# Canvas CLI environment
$env:CANVAS_CLI_HOME = "$env:USERPROFILE\.canvas-cli"
$env:Path += ";$env:CANVAS_CLI_HOME\bin"

# API Keys (optional)
$env:OPENAI_API_KEY = "your-key"
$env:ANTHROPIC_API_KEY = "your-key"

# Aliases
Set-Alias cc "canvas chat"
Set-Alias ci "canvas init"
Set-Alias cr "canvas recipe"
```

### IDE Integration

#### VS Code
Install the Canvas CLI extension:
```bash
code --install-extension canvas-cli.vscode-canvas
```

Settings (`settings.json`):
```json
{
  "canvas-cli.path": "/usr/local/bin/canvas",
  "canvas-cli.defaultModel": "llama3.2",
  "canvas-cli.autoComplete": true
}
```

#### JetBrains IDEs
1. Install Canvas CLI plugin from marketplace
2. Configure in Settings → Tools → Canvas CLI
3. Set keyboard shortcuts for quick access

## Upgrading Canvas CLI

### NPM Update
```bash
# Check current version
canvas --version

# Update to latest
npm update -g canvas-cli

# Update to specific version
npm install -g canvas-cli@2.1.0
```

### Git Repository Update
```bash
cd canvas-cli
git pull origin main
npm install
npm run build
```

### Migrate Configuration
```bash
# Backup current config
canvas config export > config.backup.json

# Update Canvas CLI
npm update -g canvas-cli

# Migrate config if needed
canvas config migrate

# Verify
canvas config test
```

## Uninstallation

### Complete Removal
```bash
# NPM uninstall
npm uninstall -g canvas-cli

# Remove configuration
rm -rf ~/.canvas-cli

# Remove cache
rm -rf ~/.cache/canvas-cli

# Remove environment variables
unset CANVAS_CLI_HOME
```

### Backup Before Removal
```bash
# Export configuration
canvas config export > canvas-backup.json

# Export conversation history
canvas export --format json --output canvas-history.json

# Backup custom tools
cp -r ~/.canvas-cli/custom-tools ./canvas-tools-backup
```

## Verification Steps

### System Check
```bash
# Run system diagnostics
canvas doctor

# Expected output:
# ✓ Node.js version: 20.10.0
# ✓ Canvas CLI version: 2.0.0
# ✓ Configuration: Valid
# ✓ Ollama: Connected
# ✓ Network: Online
# ✓ Disk space: 45GB available
# ✓ Memory: 16GB total, 8GB available
```

### Performance Test
```bash
# Run benchmark
canvas benchmark

# Test specific operations
canvas benchmark --tools
canvas benchmark --providers
canvas benchmark --context
```

## Troubleshooting Installation

### Common Issues

#### Issue: Command not found
```bash
# Check if installed globally
npm list -g canvas-cli

# Add to PATH manually
export PATH="$(npm root -g)/canvas-cli/bin:$PATH"
```

#### Issue: Permission denied
```bash
# Fix npm permissions
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Or use npx
npx canvas-cli chat
```

#### Issue: Node version mismatch
```bash
# Install Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use correct version
nvm install 20
nvm use 20
```

#### Issue: Build fails from source
```bash
# Clean install
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Use legacy peer deps if needed
npm install --legacy-peer-deps
```

## Post-Installation

### Recommended Setup
```bash
# 1. Initialize configuration
canvas config wizard

# 2. Pull recommended models (if using Ollama)
canvas exec "ollama pull llama3.2"
canvas exec "ollama pull codellama"

# 3. Test core functionality
canvas doctor --comprehensive

# 4. Create initial project
canvas init my-project

# 5. Explore features
canvas help
canvas recipe --list
canvas tools list
```

### Security Configuration
```bash
# Enable sandboxing
canvas config set security.sandboxEnabled true

# Set file access restrictions
canvas config set tools.permissions.read_file.allowedPaths '["./src", "./docs"]'

# Enable audit logging
canvas config set security.audit.enabled true
```

## Support

### Getting Help
```bash
# Built-in help
canvas help
canvas help [command]

# Documentation
canvas docs

# Community support
canvas support
```

### Reporting Issues
```bash
# Generate diagnostic report
canvas diagnose > diagnostic.txt

# Report issue with diagnostics
canvas report-issue --attach diagnostic.txt
```

---

*Last updated: December 2024 - Canvas CLI v2.0.0*