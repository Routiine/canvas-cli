# Canvas CLI Recipe System Guide

## Overview

Recipes are reusable workflow templates that automate complex, multi-step AI tasks. They support variables, conditionals, loops, and tool integration.

## Built-in Recipes

### 1. Code Review Recipe
Performs comprehensive code analysis with customizable focus areas.

```bash
canvas recipe code-review --variables '{"focus": "security,performance"}'
```

**Variables:**
- `files`: Array of files to review
- `focus`: Review focus (quality, security, performance, best-practices)
- `severity`: Minimum issue severity (info, warning, error)

### 2. Test Suite Recipe
Generates and runs comprehensive test suites.

```bash
canvas recipe test-suite --variables '{"framework": "jest", "coverage": 80}'
```

**Variables:**
- `framework`: Test framework (jest, mocha, pytest)
- `coverage`: Target coverage percentage
- `types`: Test types (unit, integration, e2e)

### 3. Deploy App Recipe
Automates application deployment workflows.

```bash
canvas recipe deploy-app --variables '{"env": "production", "strategy": "blue-green"}'
```

**Variables:**
- `env`: Target environment (dev, staging, production)
- `strategy`: Deployment strategy (rolling, blue-green, canary)
- `checks`: Pre/post deployment checks

### 4. Refactor Recipe
Intelligent code refactoring with pattern detection.

```bash
canvas recipe refactor --variables '{"pattern": "mvc", "language": "typescript"}'
```

**Variables:**
- `pattern`: Target pattern (mvc, clean-architecture, hexagonal)
- `language`: Programming language
- `scope`: Refactoring scope (file, module, project)

### 5. Documentation Recipe
Generates comprehensive project documentation.

```bash
canvas recipe docs --variables '{"format": "markdown", "include": ["api", "guides"]}'
```

**Variables:**
- `format`: Output format (markdown, html, pdf)
- `include`: Documentation sections
- `style`: Documentation style (reference, tutorial, conceptual)

## Creating Custom Recipes

### Recipe Structure

```yaml
version: "1.0.0"
name: "my-recipe"
description: "Custom workflow automation"
author: "Your Name"
tags: ["automation", "custom"]

# Define input parameters
parameters:
  - key: "input_file"
    type: "string"
    description: "Input file path"
    required: true
    default: null
    
  - key: "options"
    type: "object"
    description: "Processing options"
    required: false
    default:
      verbose: true
      format: "json"

# Define recipe steps
steps:
  # Step 1: Read input
  - id: "read-input"
    type: "tool"
    description: "Read input file"
    tool:
      name: "read_file"
      params:
        path: "{{ input_file }}"
    output: "file_content"
    
  # Step 2: Process with AI
  - id: "process"
    type: "prompt"
    description: "Process content"
    prompt: |
      Analyze the following content:
      {{ file_content }}
      
      Options: {{ options }}
    output: "analysis"
    
  # Step 3: Conditional action
  - id: "check-results"
    type: "condition"
    condition:
      expression: "{{ analysis.score > 0.8 }}"
      then:
        - type: "prompt"
          prompt: "Generate detailed report for high-quality result"
      else:
        - type: "prompt"
          prompt: "Suggest improvements for low-quality result"
    
  # Step 4: Loop through items
  - id: "process-items"
    type: "loop"
    loop:
      items: "{{ analysis.items }}"
      variable: "item"
      steps:
        - type: "tool"
          tool:
            name: "write_file"
            params:
              path: "output/{{ item.name }}.txt"
              content: "{{ item.content }}"

# Define outputs
outputs:
  - key: "report"
    description: "Analysis report"
    value: "{{ analysis }}"
  - key: "files"
    description: "Generated files"
    value: "{{ loop.results }}"

# Define hooks
hooks:
  before:
    - type: "prompt"
      prompt: "Preparing to run {{ name }} recipe..."
  after:
    - type: "tool"
      tool:
        name: "save_memory"
        params:
          key: "last_recipe"
          value: "{{ name }}"
  error:
    - type: "prompt"
      prompt: "Error in recipe: {{ error.message }}"
```

### Recipe Variables

#### Variable Types
- `string`: Text values
- `number`: Numeric values
- `boolean`: True/false
- `array`: Lists of values
- `object`: Complex structures
- `select`: Enumerated choices

#### Variable Interpolation
```yaml
# Basic interpolation
prompt: "Process {{ file_name }}"

# Nested access
prompt: "User {{ user.name }} from {{ user.location }}"

# Array access
prompt: "First item: {{ items[0] }}"

# Conditional
prompt: "Status: {{ status ? 'Active' : 'Inactive' }}"

# Filters
prompt: "Uppercase: {{ name | upper }}"
prompt: "JSON: {{ data | json }}"
prompt: "Truncate: {{ text | truncate(50) }}"
```

### Step Types

#### 1. Prompt Step
Execute AI prompts with context.

```yaml
- type: "prompt"
  prompt: |
    Your prompt here with {{ variables }}
  model: "gpt-4"  # Optional: override model
  temperature: 0.7  # Optional: generation params
  output: "result"  # Store output in variable
```

#### 2. Tool Step
Execute Canvas CLI tools.

```yaml
- type: "tool"
  tool:
    name: "read_file"
    params:
      path: "{{ file_path }}"
  output: "file_content"
  errorHandling:
    strategy: "retry"
    maxAttempts: 3
```

#### 3. Condition Step
Conditional branching.

```yaml
- type: "condition"
  condition:
    expression: "{{ score > 0.5 && status == 'active' }}"
    then:
      - type: "prompt"
        prompt: "Handle success case"
    else:
      - type: "prompt"
        prompt: "Handle failure case"
```

#### 4. Loop Step
Iterate over collections.

```yaml
- type: "loop"
  loop:
    items: "{{ files }}"
    variable: "file"
    index: "idx"  # Optional: loop index
    steps:
      - type: "prompt"
        prompt: "Process file {{ idx }}: {{ file }}"
  parallel: true  # Optional: parallel execution
  maxConcurrency: 4
```

#### 5. Parallel Step
Execute multiple steps concurrently.

```yaml
- type: "parallel"
  steps:
    - type: "tool"
      tool:
        name: "web_search"
        params:
          query: "{{ topic }} news"
    - type: "tool"
      tool:
        name: "web_search"
        params:
          query: "{{ topic }} research"
  output: "search_results"
```

#### 6. Template Step
Apply templates to data.

```yaml
- type: "template"
  template: |
    # Report for {{ title }}
    
    ## Summary
    {{ summary }}
    
    ## Details
    {% for item in items %}
    - {{ item.name }}: {{ item.value }}
    {% endfor %}
  data:
    title: "{{ project_name }}"
    summary: "{{ analysis.summary }}"
    items: "{{ analysis.details }}"
  output: "report"
```

## Advanced Recipe Features

### Error Handling

```yaml
steps:
  - type: "tool"
    tool:
      name: "risky_operation"
    errorHandling:
      strategy: "retry"  # retry, fallback, continue, abort
      maxAttempts: 3
      delay: 1000
      backoff: "exponential"
      fallback:
        - type: "prompt"
          prompt: "Handle error: {{ error.message }}"
```

### Caching

```yaml
steps:
  - type: "prompt"
    prompt: "Expensive operation"
    cache:
      enabled: true
      key: "{{ hash(input) }}"
      ttl: 3600
```

### Validation

```yaml
parameters:
  - key: "email"
    type: "string"
    validation:
      pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
      message: "Invalid email format"
  
  - key: "age"
    type: "number"
    validation:
      min: 0
      max: 150
      message: "Age must be between 0 and 150"
```

### Dependencies

```yaml
metadata:
  requires:
    - tool: "git"
      version: ">= 2.0.0"
    - tool: "docker"
      optional: true
    - model: "gpt-4"
      provider: "openai"
```

## Recipe Commands

### List Recipes
```bash
# List all available recipes
canvas recipe --list

# List with details
canvas recipe --list --verbose

# Search recipes
canvas recipe --search "code"
```

### Run Recipes
```bash
# Run with default values
canvas recipe code-review

# Run with variables
canvas recipe code-review --variables '{"files": ["src/*.ts"]}'

# Run with variable file
canvas recipe code-review --var-file variables.json

# Dry run (preview without executing)
canvas recipe code-review --dry-run
```

### Create Recipes
```bash
# Create from template
canvas recipe create my-recipe

# Create from existing
canvas recipe clone code-review my-code-review

# Validate recipe
canvas recipe validate my-recipe.yaml
```

### Manage Recipes
```bash
# Install recipe from URL
canvas recipe install https://example.com/recipe.yaml

# Export recipe
canvas recipe export my-recipe > recipe.yaml

# Delete recipe
canvas recipe delete my-recipe
```

## Recipe Examples

### 1. API Documentation Generator

```yaml
version: "1.0.0"
name: "api-docs"
description: "Generate API documentation from code"

parameters:
  - key: "source_dir"
    type: "string"
    required: true

steps:
  - type: "tool"
    tool:
      name: "glob"
      params:
        pattern: "{{ source_dir }}/**/*.ts"
    output: "files"
    
  - type: "loop"
    loop:
      items: "{{ files }}"
      variable: "file"
      steps:
        - type: "tool"
          tool:
            name: "read_file"
            params:
              path: "{{ file }}"
          output: "content"
          
        - type: "prompt"
          prompt: |
            Extract API documentation from:
            {{ content }}
            
            Format as OpenAPI specification.
          output: "api_doc"
    output: "all_docs"
    
  - type: "prompt"
    prompt: |
      Merge these API documentations:
      {{ all_docs }}
      
      Create a complete OpenAPI spec.
    output: "final_spec"
    
  - type: "tool"
    tool:
      name: "write_file"
      params:
        path: "api-docs.yaml"
        content: "{{ final_spec }}"
```

### 2. Security Audit Recipe

```yaml
version: "1.0.0"
name: "security-audit"
description: "Comprehensive security audit"

steps:
  - type: "parallel"
    steps:
      - type: "tool"
        tool:
          name: "run_shell_command"
          params:
            command: "npm audit"
        output: "npm_audit"
        
      - type: "prompt"
        prompt: "Check for hardcoded secrets in codebase"
        output: "secrets_check"
        
      - type: "prompt"
        prompt: "Review authentication implementation"
        output: "auth_review"
    output: "audit_results"
    
  - type: "prompt"
    prompt: |
      Generate security report from:
      {{ audit_results }}
      
      Include severity levels and remediation steps.
    output: "report"
```

### 3. Database Migration Recipe

```yaml
version: "1.0.0"
name: "db-migration"
description: "Database migration workflow"

parameters:
  - key: "from_version"
    type: "string"
  - key: "to_version"
    type: "string"

steps:
  - type: "prompt"
    prompt: |
      Generate migration script from {{ from_version }} to {{ to_version }}
    output: "migration_script"
    
  - type: "condition"
    condition:
      expression: "{{ dry_run == true }}"
      then:
        - type: "prompt"
          prompt: "Preview migration:\n{{ migration_script }}"
      else:
        - type: "tool"
          tool:
            name: "run_shell_command"
            params:
              command: "{{ migration_script }}"
          errorHandling:
            strategy: "abort"
```

## Best Practices

### 1. Recipe Design
- Keep recipes focused on single workflows
- Use descriptive step IDs
- Add comprehensive descriptions
- Validate inputs early
- Handle errors gracefully

### 2. Performance
- Use parallel steps when possible
- Cache expensive operations
- Minimize AI calls
- Batch similar operations

### 3. Maintainability
- Version your recipes
- Document parameters clearly
- Use meaningful variable names
- Create reusable sub-recipes

### 4. Testing
- Test with different inputs
- Verify error handling
- Use dry-run mode
- Monitor execution time

## Recipe Marketplace

Share and discover recipes:

```bash
# Browse marketplace
canvas recipe browse

# Publish recipe
canvas recipe publish my-recipe --public

# Install from marketplace
canvas recipe install @community/awesome-recipe

# Rate recipe
canvas recipe rate @community/awesome-recipe --stars 5
```

---

*Last updated: December 2024 - Canvas CLI v2.0.0*