# Canvas CLI Configuration Guide

## Table of Contents
1. [Overview](#overview)
2. [Configuration Files](#configuration-files)
3. [Environment Variables](#environment-variables)
4. [Provider Configuration](#provider-configuration)
5. [Tool Configuration](#tool-configuration)
6. [Context Settings](#context-settings)
7. [UI Customization](#ui-customization)
8. [Advanced Configuration](#advanced-configuration)
9. [Configuration Validation](#configuration-validation)
10. [Troubleshooting](#troubleshooting)

## Overview

Canvas CLI uses a hierarchical configuration system that allows settings to be defined at multiple levels:

1. **Default Configuration** - Built-in defaults
2. **Global Configuration** - User-wide settings (`~/.canvas-cli/config.json`)
3. **Project Configuration** - Project-specific settings (`.canvas-cli/config.json`)
4. **Environment Variables** - Runtime overrides
5. **Command-line Arguments** - Immediate overrides

Settings are merged in this order, with later sources overriding earlier ones.

## Configuration Files

### Global Configuration Location

- **Windows**: `%USERPROFILE%\.canvas-cli\config.json`
- **macOS/Linux**: `~/.canvas-cli/config.json`

### Project Configuration

Place a `.canvas-cli/config.json` file in your project root:

```json
{
  "defaultModel": "llama3.2",
  "defaultProvider": "ollama",
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "timeout": 30000,
      "headers": {}
    },
    "openai": {
      "apiKey": "${OPENAI_API_KEY}",
      "organization": "${OPENAI_ORG}",
      "baseUrl": "https://api.openai.com/v1",
      "timeout": 60000
    },
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}",
      "baseUrl": "https://api.anthropic.com",
      "version": "2023-06-01"
    }
  },
  "tools": {
    "enabled": true,
    "fileOperations": true,
    "shellCommands": true,
    "webSearch": true,
    "webFetch": true,
    "gitOperations": true,
    "vscodeIntegration": true,
    "multimodal": true,
    "autoConfirm": false
  },
  "context": {
    "strategy": "smart_trim",
    "maxTokens": 128000,
    "compressionEnabled": true,
    "targetUtilization": 0.8,
    "preserveSystemMessages": true,
    "ragEnabled": false
  },
  "ui": {
    "theme": "default",
    "colors": {
      "primary": "#00D9FF",
      "success": "#52C41A",
      "warning": "#FAAD14",
      "error": "#FF4D4F",
      "info": "#1890FF"
    },
    "spinner": "dots",
    "progressBar": true,
    "notifications": true,
    "sound": false
  },
  "logging": {
    "level": "info",
    "file": ".canvas-cli/logs/canvas.log",
    "maxSize": "10MB",
    "maxFiles": 5,
    "format": "json"
  },
  "security": {
    "sandboxEnabled": true,
    "allowedCommands": ["ls", "cat", "grep", "find"],
    "blockedCommands": ["rm -rf", "format"],
    "maxFileSize": "100MB",
    "timeout": 300000
  },
  "performance": {
    "cacheEnabled": true,
    "cacheDir": ".canvas-cli/cache",
    "maxCacheSize": "1GB",
    "parallelTools": true,
    "maxConcurrency": 4
  }
}
```

### Configuration Schema

Canvas CLI uses JSON Schema validation for configuration files:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "defaultModel": {
      "type": "string",
      "description": "Default AI model to use"
    },
    "defaultProvider": {
      "type": "string",
      "enum": ["ollama", "openai", "anthropic", "google"],
      "description": "Default AI provider"
    }
  }
}
```

## Environment Variables

### Core Variables

```bash
# Provider Settings
export CANVAS_CLI_DEFAULT_MODEL="llama3.2"
export CANVAS_CLI_DEFAULT_PROVIDER="ollama"
export CANVAS_CLI_OLLAMA_URL="http://localhost:11434"
export CANVAS_CLI_TIMEOUT="30000"

# API Keys
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="..."

# Tool Settings
export CANVAS_CLI_TOOLS_ENABLED="true"
export CANVAS_CLI_AUTO_CONFIRM="false"
export CANVAS_CLI_SHELL_ALLOWED="true"

# Context Settings
export CANVAS_CLI_CONTEXT_STRATEGY="smart_trim"
export CANVAS_CLI_MAX_TOKENS="128000"
export CANVAS_CLI_COMPRESSION="true"

# UI Settings
export CANVAS_CLI_THEME="dark"
export CANVAS_CLI_COLOR_OUTPUT="true"
export CANVAS_CLI_PROGRESS_BAR="true"

# Logging
export CANVAS_CLI_LOG_LEVEL="debug"
export CANVAS_CLI_LOG_FILE="canvas.log"

# Performance
export CANVAS_CLI_CACHE="true"
export CANVAS_CLI_PARALLEL="true"
```

### Variable Precedence

Environment variables override configuration file settings:

```javascript
// Priority order (highest to lowest)
1. Command-line arguments
2. Environment variables
3. Project configuration
4. Global configuration
5. Default values
```

## Provider Configuration

### Ollama Configuration

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "timeout": 30000,
      "models": {
        "default": "llama3.2",
        "aliases": {
          "fast": "llama3.2",
          "smart": "llama3.2:70b",
          "code": "codellama:34b"
        }
      },
      "options": {
        "num_predict": 2048,
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40,
        "repeat_penalty": 1.1,
        "seed": -1,
        "num_ctx": 4096,
        "num_gpu": -1
      }
    }
  }
}
```

### OpenAI Configuration

```json
{
  "providers": {
    "openai": {
      "apiKey": "${OPENAI_API_KEY}",
      "organization": "org-...",
      "baseUrl": "https://api.openai.com/v1",
      "timeout": 60000,
      "models": {
        "default": "gpt-4-turbo",
        "aliases": {
          "fast": "gpt-3.5-turbo",
          "smart": "gpt-4-turbo",
          "vision": "gpt-4-vision-preview"
        }
      },
      "options": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 0.9,
        "frequency_penalty": 0,
        "presence_penalty": 0
      }
    }
  }
}
```

### Anthropic Configuration

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}",
      "baseUrl": "https://api.anthropic.com",
      "version": "2023-06-01",
      "timeout": 60000,
      "models": {
        "default": "claude-3-opus-20240229",
        "aliases": {
          "fast": "claude-3-haiku-20240307",
          "smart": "claude-3-opus-20240229",
          "balanced": "claude-3-sonnet-20240229"
        }
      },
      "options": {
        "max_tokens": 4096,
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40
      }
    }
  }
}
```

### Multi-Provider Setup

```json
{
  "providers": {
    "routing": {
      "strategy": "cost_optimized",
      "rules": [
        {
          "pattern": "code review|analyze",
          "provider": "anthropic",
          "model": "claude-3-opus-20240229"
        },
        {
          "pattern": "simple|quick|fast",
          "provider": "ollama",
          "model": "llama3.2"
        },
        {
          "pattern": "image|vision|screenshot",
          "provider": "openai",
          "model": "gpt-4-vision-preview"
        }
      ],
      "fallback": {
        "enabled": true,
        "order": ["ollama", "openai", "anthropic"]
      }
    }
  }
}
```

## Tool Configuration

### Enabling/Disabling Tools

```json
{
  "tools": {
    "enabled": true,
    "categories": {
      "fileSystem": {
        "enabled": true,
        "tools": {
          "read_file": true,
          "write_file": true,
          "edit_file": true,
          "delete_file": false,
          "list_directory": true
        }
      },
      "shell": {
        "enabled": true,
        "restricted": true,
        "allowedCommands": ["ls", "cat", "echo", "pwd"],
        "environment": {
          "PATH": "/usr/local/bin:/usr/bin:/bin",
          "SHELL": "/bin/bash"
        }
      },
      "web": {
        "enabled": true,
        "tools": {
          "web_search": true,
          "web_fetch": true,
          "api_request": false
        },
        "restrictions": {
          "allowedDomains": ["*.github.com", "*.stackoverflow.com"],
          "blockedDomains": ["*.adult.com"],
          "maxRequestSize": "10MB"
        }
      },
      "git": {
        "enabled": true,
        "autoCommit": false,
        "signCommits": true,
        "defaultBranch": "main"
      }
    }
  }
}
```

### Custom Tool Directories

```json
{
  "tools": {
    "customToolDirs": [
      "./custom-tools",
      "~/.canvas-cli/tools",
      "./node_modules/@company/canvas-tools"
    ],
    "autoLoad": true,
    "validation": {
      "required": true,
      "schema": "strict"
    }
  }
}
```

### Tool Permissions

```json
{
  "tools": {
    "permissions": {
      "read_file": {
        "allowedPaths": ["./src", "./docs", "./tests"],
        "blockedPaths": ["/etc", "/sys", "node_modules"],
        "maxFileSize": "10MB"
      },
      "write_file": {
        "allowedPaths": ["./output", "./generated"],
        "requireConfirmation": true,
        "backup": true
      },
      "run_shell_command": {
        "requireConfirmation": true,
        "timeout": 30000,
        "maxOutputSize": "1MB"
      }
    }
  }
}
```

## Context Settings

### Token Management

```json
{
  "context": {
    "tokenization": {
      "model": "gpt-4",
      "library": "tiktoken",
      "cache": true
    },
    "limits": {
      "maxTokens": 128000,
      "reserveTokens": 1000,
      "maxMessages": 100
    },
    "compression": {
      "enabled": true,
      "strategy": "smart_trim",
      "threshold": 0.8,
      "minImportance": 0.3,
      "preserveRecent": 10
    }
  }
}
```

### RAG Configuration

```json
{
  "context": {
    "rag": {
      "enabled": true,
      "embedding": {
        "model": "text-embedding-ada-002",
        "dimensions": 1536,
        "provider": "openai"
      },
      "vectorStore": {
        "type": "faiss",
        "path": ".canvas-cli/vectors",
        "indexType": "IVF"
      },
      "retrieval": {
        "topK": 5,
        "minScore": 0.7,
        "rerank": true
      },
      "chunking": {
        "size": 1000,
        "overlap": 200,
        "separator": "\n\n"
      }
    }
  }
}
```

### Memory Settings

```json
{
  "context": {
    "memory": {
      "persistent": true,
      "path": ".canvas-cli/memory",
      "maxSize": "100MB",
      "ttl": 2592000,
      "categories": {
        "facts": { "priority": 1, "ttl": null },
        "preferences": { "priority": 0.8, "ttl": 7776000 },
        "temporary": { "priority": 0.3, "ttl": 86400 }
      }
    }
  }
}
```

## UI Customization

### Theme Configuration

```json
{
  "ui": {
    "theme": "custom",
    "themes": {
      "custom": {
        "colors": {
          "primary": "#00D9FF",
          "secondary": "#FF00D9",
          "success": "#00FF00",
          "warning": "#FFA500",
          "error": "#FF0000",
          "info": "#0080FF",
          "muted": "#808080"
        },
        "text": {
          "default": "#FFFFFF",
          "dim": "#A0A0A0",
          "bright": "#FFFF00"
        },
        "background": {
          "default": "#000000",
          "highlight": "#1A1A1A"
        }
      }
    }
  }
}
```

### Output Formatting

```json
{
  "ui": {
    "output": {
      "markdown": true,
      "syntaxHighlight": true,
      "tables": "box",
      "codeTheme": "monokai",
      "lineNumbers": true,
      "wrapLines": false,
      "maxWidth": 120
    },
    "prompt": {
      "multiline": true,
      "history": true,
      "suggestions": true,
      "autocomplete": true
    }
  }
}
```

### Notification Settings

```json
{
  "ui": {
    "notifications": {
      "enabled": true,
      "types": {
        "success": { "enabled": true, "sound": "ding" },
        "error": { "enabled": true, "sound": "error" },
        "warning": { "enabled": true, "sound": null },
        "info": { "enabled": false }
      },
      "desktop": true,
      "position": "top-right",
      "duration": 5000
    }
  }
}
```

## Advanced Configuration

### Performance Tuning

```json
{
  "performance": {
    "streaming": {
      "enabled": true,
      "bufferSize": 4096,
      "flushInterval": 100
    },
    "caching": {
      "enabled": true,
      "strategies": {
        "embeddings": { "ttl": 86400, "maxSize": "500MB" },
        "completions": { "ttl": 3600, "maxSize": "100MB" },
        "tools": { "ttl": 300, "maxSize": "50MB" }
      }
    },
    "concurrency": {
      "maxParallelTools": 4,
      "maxParallelRequests": 2,
      "queueSize": 10
    },
    "optimization": {
      "lazyLoading": true,
      "preloadCommon": true,
      "compressResponses": true
    }
  }
}
```

### Security Configuration

```json
{
  "security": {
    "authentication": {
      "required": false,
      "methods": ["api_key", "oauth", "basic"],
      "session": {
        "timeout": 3600,
        "renewable": true
      }
    },
    "encryption": {
      "atRest": true,
      "inTransit": true,
      "algorithm": "AES-256-GCM"
    },
    "audit": {
      "enabled": true,
      "logFile": ".canvas-cli/audit.log",
      "events": ["tool_execution", "file_access", "api_calls"],
      "retention": 90
    },
    "sandbox": {
      "enabled": true,
      "type": "docker",
      "image": "canvas-cli/sandbox:latest",
      "timeout": 60000,
      "memory": "512MB",
      "cpu": "0.5"
    }
  }
}
```

### Monitoring Configuration

```json
{
  "monitoring": {
    "metrics": {
      "enabled": true,
      "collect": ["latency", "tokens", "errors", "tools"],
      "interval": 60,
      "export": {
        "type": "prometheus",
        "endpoint": "http://localhost:9090/metrics"
      }
    },
    "tracing": {
      "enabled": false,
      "provider": "jaeger",
      "endpoint": "http://localhost:14268/api/traces",
      "sampling": 0.1
    },
    "healthcheck": {
      "enabled": true,
      "port": 3001,
      "path": "/health",
      "interval": 30
    }
  }
}
```

### Plugin Configuration

```json
{
  "plugins": {
    "enabled": true,
    "directories": [
      "~/.canvas-cli/plugins",
      "./plugins"
    ],
    "autoLoad": true,
    "config": {
      "github-integration": {
        "token": "${GITHUB_TOKEN}",
        "defaultRepo": "owner/repo"
      },
      "slack-notifier": {
        "webhook": "${SLACK_WEBHOOK}",
        "channel": "#canvas-cli"
      }
    }
  }
}
```

## Configuration Validation

### Using the Config Validator

```bash
# Validate configuration file
canvas config validate

# Validate with verbose output
canvas config validate --verbose

# Validate specific file
canvas config validate --file custom-config.json

# Generate configuration schema
canvas config schema > config.schema.json
```

### Common Validation Errors

```json
{
  "errors": [
    {
      "path": "/providers/ollama/baseUrl",
      "message": "Invalid URL format",
      "value": "localhost:11434",
      "expected": "http://localhost:11434"
    },
    {
      "path": "/context/maxTokens",
      "message": "Value exceeds maximum",
      "value": 1000000,
      "maximum": 200000
    }
  ]
}
```

### Auto-fix Configuration

```bash
# Auto-fix common issues
canvas config fix

# Fix and backup original
canvas config fix --backup

# Fix specific issues
canvas config fix --only urls,paths
```

## Configuration Commands

### CLI Configuration Management

```bash
# View current configuration
canvas config

# Set a configuration value
canvas config set defaultModel llama3.2

# Get a configuration value
canvas config get defaultModel

# Reset to defaults
canvas config reset

# Import configuration
canvas config import config.json

# Export configuration
canvas config export > my-config.json
```

### Configuration Wizard

```bash
# Interactive configuration setup
canvas config wizard

# Quick setup for specific provider
canvas config setup ollama
canvas config setup openai

# Test configuration
canvas config test
```

## Troubleshooting

### Common Issues

#### Issue: Provider not connecting

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434",  // Try 127.0.0.1 instead of localhost
      "timeout": 60000,  // Increase timeout
      "retryPolicy": {
        "maxAttempts": 3,
        "delay": 1000,
        "backoff": "exponential"
      }
    }
  }
}
```

#### Issue: Context overflow

```json
{
  "context": {
    "strategy": "summarize",  // Change from smart_trim
    "maxTokens": 64000,  // Reduce from 128000
    "aggressiveCompression": true,
    "dropOldestFirst": true
  }
}
```

#### Issue: Tool timeout

```json
{
  "tools": {
    "timeout": {
      "default": 30000,
      "perTool": {
        "web_fetch": 60000,
        "run_shell_command": 120000
      }
    }
  }
}
```

### Debug Configuration

```json
{
  "debug": {
    "enabled": true,
    "verbose": true,
    "logLevel": "trace",
    "logRequests": true,
    "logResponses": true,
    "saveConversations": true,
    "performanceMetrics": true,
    "dumpOnError": true
  }
}
```

### Configuration Profiles

Create different profiles for different use cases:

```json
{
  "profiles": {
    "development": {
      "defaultProvider": "ollama",
      "defaultModel": "llama3.2",
      "tools": { "autoConfirm": true },
      "logging": { "level": "debug" }
    },
    "production": {
      "defaultProvider": "openai",
      "defaultModel": "gpt-4-turbo",
      "tools": { "autoConfirm": false },
      "logging": { "level": "error" },
      "security": { "sandboxEnabled": true }
    },
    "testing": {
      "defaultProvider": "mock",
      "tools": { "enabled": false },
      "logging": { "level": "trace" }
    }
  }
}
```

Use profiles:
```bash
# Use specific profile
canvas --profile development

# Set default profile
canvas config set defaultProfile production
```

## Best Practices

### 1. Security
- Never commit API keys to version control
- Use environment variables for sensitive data
- Enable sandboxing for untrusted operations
- Regularly rotate API keys

### 2. Performance
- Enable caching for better performance
- Adjust token limits based on your needs
- Use appropriate compression strategies
- Configure reasonable timeouts

### 3. Organization
- Use project-specific configurations
- Create profiles for different environments
- Document custom settings
- Version control configuration templates

### 4. Maintenance
- Regularly validate configurations
- Monitor error logs
- Update provider URLs when needed
- Clean cache periodically

## Configuration Examples

### Minimal Configuration

```json
{
  "defaultModel": "llama3.2",
  "defaultProvider": "ollama"
}
```

### Developer Configuration

```json
{
  "defaultModel": "codellama:34b",
  "defaultProvider": "ollama",
  "tools": {
    "enabled": true,
    "autoConfirm": true
  },
  "context": {
    "strategy": "smart_trim",
    "maxTokens": 100000
  },
  "ui": {
    "theme": "dark",
    "syntaxHighlight": true
  }
}
```

### Enterprise Configuration

```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "apiKey": "${OPENAI_API_KEY}",
      "organization": "${OPENAI_ORG}"
    }
  },
  "security": {
    "sandboxEnabled": true,
    "audit": { "enabled": true }
  },
  "monitoring": {
    "metrics": { "enabled": true },
    "tracing": { "enabled": true }
  },
  "logging": {
    "level": "info",
    "file": "/var/log/canvas-cli.log"
  }
}
```

---

*Last updated: December 2024 - Canvas CLI v2.0.0*