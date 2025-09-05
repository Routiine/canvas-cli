# Canvas CLI Provider Setup Guide

## Supported Providers

### 1. Ollama (Local AI)
**Best for**: Privacy, offline use, cost-effectiveness

#### Installation
```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download

# Start Ollama
ollama serve

# Pull models
ollama pull llama3.2
ollama pull codellama
ollama pull mistral
```

#### Configuration
```json
{
  "defaultProvider": "ollama",
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "models": {
        "default": "llama3.2",
        "code": "codellama:34b",
        "chat": "llama3.2:70b"
      }
    }
  }
}
```

#### Available Models
- **llama3.2**: Fast, general purpose (8B parameters)
- **llama3.2:70b**: Powerful, slower (70B parameters)
- **codellama**: Specialized for code
- **mistral**: Efficient, good quality
- **mixtral**: MoE architecture, powerful

### 2. OpenAI
**Best for**: Cutting-edge performance, vision capabilities

#### Setup
```bash
# Get API key from https://platform.openai.com/api-keys
export OPENAI_API_KEY="sk-..."

# Optional: Organization ID
export OPENAI_ORG="org-..."
```

#### Configuration
```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "apiKey": "${OPENAI_API_KEY}",
      "organization": "${OPENAI_ORG}",
      "models": {
        "default": "gpt-4-turbo",
        "fast": "gpt-3.5-turbo",
        "vision": "gpt-4-vision-preview"
      }
    }
  }
}
```

#### Model Pricing (per 1K tokens)
- **GPT-4 Turbo**: $0.01 input / $0.03 output
- **GPT-3.5 Turbo**: $0.0005 input / $0.0015 output
- **GPT-4 Vision**: $0.01 input / $0.03 output

### 3. Anthropic Claude
**Best for**: Long context, safety, reasoning

#### Setup
```bash
# Get API key from https://console.anthropic.com/
export ANTHROPIC_API_KEY="sk-ant-..."
```

#### Configuration
```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}",
      "models": {
        "default": "claude-3-opus-20240229",
        "fast": "claude-3-haiku-20240307",
        "balanced": "claude-3-sonnet-20240229"
      }
    }
  }
}
```

#### Model Comparison
- **Claude 3 Opus**: Most capable, 200K context
- **Claude 3 Sonnet**: Balanced performance
- **Claude 3 Haiku**: Fast, cost-effective

## Provider Selection Guide

### By Use Case

| Use Case | Recommended Provider | Model | Reason |
|----------|---------------------|--------|--------|
| Code Review | Anthropic | Claude 3 Opus | Superior code understanding |
| Quick Tasks | Ollama | llama3.2 | Fast, local, free |
| Vision Tasks | OpenAI | GPT-4 Vision | Best image understanding |
| Long Documents | Anthropic | Claude 3 | 200K token context |
| Offline Work | Ollama | Any | Fully local |
| Cost-Sensitive | Ollama | llama3.2 | Free after setup |

### Performance Comparison

| Provider | Latency | Quality | Cost | Privacy |
|----------|---------|---------|------|----------|
| Ollama | ⚡ Fast (local) | ⭐⭐⭐ Good | Free | ⭐⭐⭐⭐⭐ Excellent |
| OpenAI | ⚡⚡ Medium | ⭐⭐⭐⭐⭐ Excellent | $$$ | ⭐⭐ Limited |
| Anthropic | ⚡⚡ Medium | ⭐⭐⭐⭐⭐ Excellent | $$$ | ⭐⭐⭐ Good |

## Multi-Provider Setup

### Automatic Routing
```json
{
  "providers": {
    "routing": {
      "rules": [
        {
          "pattern": "code|debug|analyze",
          "provider": "anthropic"
        },
        {
          "pattern": "image|vision|screenshot",
          "provider": "openai"
        },
        {
          "pattern": ".*",
          "provider": "ollama"
        }
      ]
    }
  }
}
```

### Fallback Chain
```json
{
  "providers": {
    "fallback": {
      "enabled": true,
      "chain": ["ollama", "openai", "anthropic"],
      "retryDelay": 1000
    }
  }
}
```

## Testing Providers

```bash
# Test current provider
canvas config test

# Test specific provider
canvas config test --provider ollama

# Benchmark providers
canvas config benchmark
```

## Troubleshooting

### Ollama Connection Issues
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
systemctl restart ollama  # Linux
brew services restart ollama  # macOS
```

### API Key Issues
```bash
# Verify API keys are set
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY

# Test API keys
canvas config test-keys
```

### Rate Limiting
```json
{
  "providers": {
    "rateLimiting": {
      "openai": {
        "requestsPerMinute": 60,
        "tokensPerMinute": 90000
      }
    }
  }
}
```