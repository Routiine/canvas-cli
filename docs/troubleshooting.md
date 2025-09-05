# Canvas CLI Troubleshooting Guide

## Common Issues and Solutions

### Installation Issues

#### Issue: Command not found after installation
**Symptoms**: `canvas: command not found` error after npm installation

**Solutions**:
```bash
# Check if Canvas CLI is installed globally
npm list -g canvas-cli

# If installed but not found, add npm global bin to PATH
export PATH="$(npm root -g)/canvas-cli/bin:$PATH"

# Alternative: Use npx
npx canvas-cli chat

# Windows: Check npm prefix
npm config get prefix
# Add the returned path + \bin to your PATH environment variable
```

#### Issue: Permission denied during installation
**Symptoms**: EACCES or permission errors during npm install

**Solutions**:
```bash
# Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Alternative: Use a Node version manager
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
npm install -g canvas-cli

# Windows: Run as Administrator
# Right-click PowerShell/CMD and select "Run as Administrator"
npm install -g canvas-cli
```

#### Issue: Node.js version incompatible
**Symptoms**: "Error: Node.js version 20.0.0 or higher required"

**Solutions**:
```bash
# Check current Node.js version
node --version

# Update Node.js using nvm
nvm install 20
nvm use 20
nvm alias default 20

# Update Node.js on Windows
# Download latest from https://nodejs.org

# Update Node.js on macOS
brew upgrade node

# Update Node.js on Linux
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Provider Connection Issues

#### Issue: Ollama not connecting
**Symptoms**: "Failed to connect to Ollama at http://localhost:11434"

**Solutions**:
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama service
ollama serve

# Check Ollama logs
journalctl -u ollama -f  # Linux with systemd
brew services list  # macOS - check if running

# Windows: Check if Ollama is in system tray
# Start Ollama from Start Menu if not running

# Verify models are installed
ollama list
ollama pull llama3.2  # Pull if missing
```

#### Issue: API key not recognized
**Symptoms**: "Invalid API key" or "Authentication failed"

**Solutions**:
```bash
# Verify environment variables are set
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY

# Set API keys properly
export OPENAI_API_KEY="sk-..."  # No spaces around =
export ANTHROPIC_API_KEY="sk-ant-..."

# Windows PowerShell
$env:OPENAI_API_KEY = "sk-..."
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# Make persistent (add to shell profile)
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc

# Test API keys
canvas config test-keys
```

#### Issue: Rate limiting errors
**Symptoms**: "Rate limit exceeded" or 429 errors

**Solutions**:
```bash
# Configure rate limiting
canvas config set providers.rateLimiting.openai.requestsPerMinute 30
canvas config set providers.rateLimiting.openai.tokensPerMinute 40000

# Use different provider temporarily
canvas chat --provider ollama "Your prompt here"

# Enable automatic fallback
canvas config set providers.fallback.enabled true
canvas config set providers.fallback.chain '["ollama", "openai", "anthropic"]'
```

### Performance Issues

#### Issue: Slow response times
**Symptoms**: Commands take too long to execute

**Solutions**:
```bash
# Use faster models
canvas config set providers.ollama.models.default "llama3.2"  # Smaller, faster
canvas chat --model "gpt-3.5-turbo"  # Faster than GPT-4

# Check system resources
canvas doctor --performance

# Clear cache
rm -rf ~/.canvas-cli/cache
canvas config set cache.maxSize 100  # Limit cache size (MB)

# Disable unnecessary features
canvas config set tools.autoSuggest false
canvas config set context.autoCompress false
```

#### Issue: High memory usage
**Symptoms**: System becomes sluggish, out of memory errors

**Solutions**:
```bash
# Check memory usage
canvas doctor --memory

# Limit context size
canvas config set context.maxTokens 4000
canvas config set context.compressionThreshold 2000

# Use smaller models
canvas config set providers.ollama.models.default "llama3.2:7b"

# Clear conversation history
canvas context clear

# Limit parallel operations
canvas config set performance.maxConcurrentTools 2
```

#### Issue: GPU not being utilized (Ollama)
**Symptoms**: Slow inference despite having capable GPU

**Solutions**:
```bash
# Check GPU availability
nvidia-smi  # NVIDIA GPUs
rocm-smi   # AMD GPUs

# Set Ollama to use GPU
export OLLAMA_GPU_LAYERS=35  # Number of layers to offload
ollama serve

# Verify GPU usage during inference
watch -n 1 nvidia-smi

# macOS with Apple Silicon
# GPU is used automatically, ensure Ollama is updated
brew upgrade ollama
```

### Tool Execution Issues

#### Issue: Tool permissions denied
**Symptoms**: "Permission denied: Tool 'write_file' is not allowed"

**Solutions**:
```bash
# Check current permissions
canvas tools permissions

# Enable specific tools
canvas config set tools.permissions.write_file.enabled true
canvas config set tools.permissions.run_shell_command.enabled true

# Set allowed paths
canvas config set tools.permissions.read_file.allowedPaths '["./src", "./docs", "./tests"]'
canvas config set tools.permissions.write_file.allowedPaths '["./src", "./output"]'

# Disable sandboxing (use with caution)
canvas config set security.sandboxEnabled false
```

#### Issue: Shell commands not working
**Symptoms**: "Command not found" or "Shell execution failed"

**Solutions**:
```bash
# Check shell configuration
canvas config get tools.shell.type

# Set correct shell
canvas config set tools.shell.type "bash"  # or "powershell" on Windows

# Windows: Enable command execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Verify PATH is accessible
canvas exec "echo $PATH"

# Use full paths for commands
canvas exec "/usr/local/bin/git status"
```

#### Issue: File operations failing
**Symptoms**: Cannot read/write files, "File not found" errors

**Solutions**:
```bash
# Check current working directory
canvas exec "pwd"

# Use absolute paths
canvas chat "Read file at /absolute/path/to/file.txt"

# Check file permissions
ls -la file.txt  # Unix/macOS
dir file.txt     # Windows

# Fix file permissions
chmod 644 file.txt  # Unix/macOS
icacls file.txt /grant Everyone:F  # Windows

# Verify Canvas CLI has access
canvas tools test read_file --path "./test.txt"
```

### Configuration Issues

#### Issue: Configuration not persisting
**Symptoms**: Settings reset after restart

**Solutions**:
```bash
# Check config file location
canvas config path

# Verify config file exists
ls -la ~/.canvas-cli/config.json

# Fix permissions
chmod 644 ~/.canvas-cli/config.json

# Backup and restore config
canvas config export > backup.json
canvas config import backup.json

# Reset to defaults if corrupted
canvas config reset
canvas config wizard  # Re-run setup
```

#### Issue: Invalid configuration format
**Symptoms**: "Invalid configuration" or JSON parse errors

**Solutions**:
```bash
# Validate configuration
canvas config validate

# View current configuration
canvas config show

# Fix common JSON issues
canvas config fix

# Manual edit (careful with JSON syntax)
nano ~/.canvas-cli/config.json

# Reset specific section
canvas config reset providers
canvas config reset tools
```

### Chat Mode Issues

#### Issue: Context lost between messages
**Symptoms**: AI doesn't remember previous conversation

**Solutions**:
```bash
# Check context settings
canvas config get context.enabled

# Enable context persistence
canvas config set context.enabled true
canvas config set context.strategy "sliding"

# Increase context window
canvas config set context.maxTokens 8000

# View current context
canvas context show

# Save and restore sessions
canvas context save my-session
canvas context load my-session
```

#### Issue: Responses cut off or incomplete
**Symptoms**: AI responses end abruptly

**Solutions**:
```bash
# Increase max tokens
canvas config set providers.openai.maxTokens 4000
canvas config set providers.anthropic.maxTokens 4000

# Check token usage
canvas chat --verbose "Your prompt"

# Use streaming for long responses
canvas config set chat.streaming true

# Split complex requests
# Instead of one large request, break into smaller parts
```

### Recipe Execution Issues

#### Issue: Recipe not found
**Symptoms**: "Recipe 'name' not found"

**Solutions**:
```bash
# List available recipes
canvas recipe --list

# Check recipe directory
ls ~/.canvas-cli/recipes/

# Install missing recipe
canvas recipe install recipe-name

# Refresh recipe cache
canvas recipe refresh

# Create recipe from template
canvas recipe create my-recipe
```

#### Issue: Recipe variables not working
**Symptoms**: Variables show as undefined or literal strings

**Solutions**:
```bash
# Check variable syntax
# Correct: {{ variable_name }}
# Wrong: { variable_name } or $variable_name

# Pass variables correctly
canvas recipe run my-recipe --variables '{"key": "value"}'

# Use variable file for complex data
echo '{"key": "value"}' > vars.json
canvas recipe run my-recipe --var-file vars.json

# Debug with dry run
canvas recipe run my-recipe --dry-run --verbose
```

### Build and Development Issues

#### Issue: TypeScript compilation errors
**Symptoms**: Build fails with TypeScript errors

**Solutions**:
```bash
# Clean build
rm -rf dist/ node_modules/ package-lock.json
npm install
npm run build

# Check TypeScript version
npx tsc --version

# Fix type definitions
npm install --save-dev @types/node

# Use legacy peer deps if needed
npm install --legacy-peer-deps

# Build with verbose output
npm run build -- --verbose
```

#### Issue: Module not found errors
**Symptoms**: "Cannot find module" errors at runtime

**Solutions**:
```bash
# Rebuild project
npm run clean
npm install
npm run build

# Check for missing dependencies
npm ls

# Install missing packages
npm install missing-package

# Link for local development
npm link

# Clear npm cache
npm cache clean --force
```

## Diagnostic Commands

### System Health Check
```bash
# Complete diagnostics
canvas doctor

# Specific checks
canvas doctor --network
canvas doctor --providers
canvas doctor --performance
canvas doctor --storage

# Generate diagnostic report
canvas diagnose > diagnostic.txt
```

### Debug Mode
```bash
# Enable debug logging
export CANVAS_DEBUG=true
canvas chat "Test message"

# Verbose output
canvas chat --verbose "Test message"

# Log to file
canvas chat "Test message" 2> debug.log
```

### Test Commands
```bash
# Test configuration
canvas config test

# Test specific provider
canvas config test --provider ollama

# Test tool execution
canvas tools test read_file --path "./test.txt"

# Benchmark performance
canvas benchmark
canvas benchmark --tools
canvas benchmark --providers
```

## Getting Help

### Built-in Help
```bash
# General help
canvas help

# Command-specific help
canvas help chat
canvas help recipe
canvas help config

# Interactive help
canvas chat "How do I configure providers?"
```

### Community Support
```bash
# Report issues
canvas report-issue

# View documentation
canvas docs

# Community forum
canvas support --forum

# Discord server
canvas support --discord
```

### Logging and Debugging

#### Enable Detailed Logging
```bash
# Set log level
canvas config set logging.level "debug"

# Log locations
# macOS/Linux: ~/.canvas-cli/logs/
# Windows: %USERPROFILE%\.canvas-cli\logs\

# View logs
tail -f ~/.canvas-cli/logs/canvas.log

# Clear old logs
canvas logs clear --older-than 7d
```

#### Debug Environment Variables
```bash
export CANVAS_DEBUG=true
export CANVAS_LOG_LEVEL=debug
export CANVAS_TRACE_TOOLS=true
export CANVAS_VERBOSE=true
```

## Emergency Recovery

### Complete Reset
```bash
# Backup current state
canvas config export > emergency-backup.json
canvas context export > context-backup.json

# Complete uninstall
npm uninstall -g canvas-cli
rm -rf ~/.canvas-cli

# Fresh install
npm install -g canvas-cli
canvas config wizard

# Restore if needed
canvas config import emergency-backup.json
```

### Safe Mode
```bash
# Start in safe mode (minimal features)
canvas --safe-mode chat

# Disable all tools temporarily
canvas --no-tools chat

# Use fallback provider
canvas --provider ollama --model llama3.2 chat
```

## Prevention Tips

### Regular Maintenance
```bash
# Weekly tasks
canvas cache clear
canvas logs rotate
canvas config validate

# Monthly tasks
canvas update
canvas recipe update
canvas tools update

# Before major updates
canvas config export > pre-update-backup.json
canvas context export > pre-update-context.json
```

### Best Practices
1. **Always backup before updates**: `canvas config export > backup.json`
2. **Use version control for custom recipes**: Store in git repository
3. **Monitor resource usage**: `canvas doctor --continuous`
4. **Keep providers updated**: Regular model updates for better performance
5. **Set appropriate rate limits**: Prevent API throttling
6. **Use local models for development**: Reduce API costs
7. **Enable audit logging**: Track all operations for debugging

---

*Last updated: December 2024 - Canvas CLI v2.0.0*