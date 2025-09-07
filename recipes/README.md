# Canvas CLI Recipe System

The Canvas CLI Recipe System provides reusable, parameterized workflows for common development tasks. Recipes are YAML-based templates that can be executed with the Canvas CLI to automate complex development workflows.

## Directory Structure

```
recipes/
├── built-in/           # Built-in recipes shipped with Canvas CLI
│   ├── quick-start.yaml
│   ├── security-audit.yaml
│   ├── performance-optimization.yaml
│   └── feature-development.yaml
├── community/          # Community-contributed recipes (downloaded from marketplace)
└── custom/            # User-created custom recipes
```

## Using Recipes

### List Available Recipes

```bash
canvas recipe list
```

### Run a Recipe

```bash
canvas recipe run quick-start
```

### Run with Parameters

```bash
canvas recipe run quick-start --project-name my-app --project-type react
```

### Create a New Recipe

```bash
canvas recipe create my-recipe
```

### Share a Recipe

```bash
canvas recipe share my-recipe
```

## Recipe Format

Recipes are defined in YAML format with the following structure:

```yaml
version: "1.0.0"
title: "Recipe Title"
description: "Recipe description"
author: "Author Name"
tags:
  - tag1
  - tag2

parameters:
  - key: param_name
    input_type: string|number|boolean|select|multiselect|file|directory
    requirement: required|optional|user_prompt
    description: "Parameter description"
    default: "default value"
    validation:
      pattern: "regex pattern"
      min: 0
      max: 100

prompt: |
  The prompt template using {{ parameter_name }} variables

system_prompt: |
  System prompt for the AI model

tools:
  - tool1
  - tool2

model_preferences:
  preferred_models:
    - model1
    - model2
  min_context_length: 8192
  requires_tools: true

execution:
  max_iterations: 10
  timeout: 300
  parallel: false

examples:
  - name: "Example 1"
    description: "Example description"
    parameters:
      param1: value1
      param2: value2
    expected_output: "Expected result"
```

## Built-in Recipes

### 1. Quick Start (`quick-start.yaml`)
Initialize new projects with best practices, testing, CI/CD, and documentation.

**Use Cases:**
- Starting a new Node.js/React/Vue/Python/Go/Rust project
- Setting up testing frameworks
- Configuring CI/CD pipelines
- Creating Docker configurations

### 2. Security Audit (`security-audit.yaml`)
Comprehensive security analysis and vulnerability remediation.

**Use Cases:**
- OWASP Top 10 vulnerability scanning
- Dependency vulnerability analysis
- Code injection detection
- Compliance checking (GDPR, HIPAA, SOC2)
- Automated security fixes

### 3. Performance Optimization (`performance-optimization.yaml`)
Analyze and optimize application performance.

**Use Cases:**
- Performance profiling and benchmarking
- Memory leak detection
- Database query optimization
- Frontend Core Web Vitals improvement
- API response time optimization

### 4. Feature Development (`feature-development.yaml`)
End-to-end feature development with TDD and clean code practices.

**Use Cases:**
- Implementing new features with TDD/BDD
- Creating API endpoints
- Building UI components
- Database schema changes
- Comprehensive testing

## Recipe Parameters

### Input Types

- **string**: Text input
- **number**: Numeric input
- **boolean**: Yes/no choice
- **select**: Single choice from options
- **multiselect**: Multiple choices from options
- **file**: File path input
- **directory**: Directory path input

### Requirements

- **required**: Must be provided
- **optional**: Can be omitted
- **user_prompt**: Will prompt user during execution

### Validation

Parameters can include validation rules:
- `pattern`: Regex pattern for strings
- `min`/`max`: Range for numbers
- `minLength`/`maxLength`: Length constraints for strings

## Template Variables

Recipes use Nunjucks templating with these filters:
- `{{ variable | upper }}`: Convert to uppercase
- `{{ variable | lower }}`: Convert to lowercase
- `{{ variable | title }}`: Convert to title case

## Creating Custom Recipes

1. Create a new YAML file in `recipes/custom/`
2. Define parameters, prompts, and execution settings
3. Test the recipe locally
4. Share with the community if desired

## Recipe Marketplace

The Canvas CLI Recipe Marketplace allows sharing and discovering recipes:

### Browse Marketplace
```bash
canvas recipe browse
```

### Install from Marketplace
```bash
canvas recipe install <recipe-name>
```

### Publish to Marketplace
```bash
canvas recipe publish <recipe-name>
```

## Advanced Features

### Recipe Composition
Recipes can call other recipes:
```yaml
dependencies:
  - quick-start
  - security-audit
```

### Conditional Execution
Use Nunjucks conditionals in prompts:
```yaml
prompt: |
  {% if include_tests %}
  Set up testing framework
  {% endif %}
```

### Dynamic Parameters
Parameters can be computed:
```yaml
parameters:
  - key: output_dir
    default: "{{ project_name }}-output"
```

## Best Practices

1. **Keep recipes focused**: Each recipe should do one thing well
2. **Use clear parameter names**: Make parameters self-documenting
3. **Provide examples**: Include realistic examples in recipes
4. **Test thoroughly**: Test recipes with various parameter combinations
5. **Document well**: Include clear instructions and descriptions
6. **Version properly**: Use semantic versioning for recipes
7. **Handle errors**: Include error handling in prompts
8. **Be idempotent**: Recipes should be safe to run multiple times

## Contributing Recipes

We welcome recipe contributions! To contribute:

1. Fork the Canvas CLI repository
2. Create your recipe in `recipes/community/`
3. Test the recipe thoroughly
4. Submit a pull request
5. Include documentation and examples

## Support

For recipe-related issues or questions:
- GitHub Issues: https://github.com/canvas-cli/canvas-cli/issues
- Documentation: https://canvas-cli.dev/recipes
- Discord: https://discord.gg/canvas-cli