# Getting Started with Canvas CLI - Complete Tutorial

## Introduction

Welcome to Canvas CLI! This tutorial will walk you through your first experience with Canvas CLI, from installation to building your first application using AI-powered agents.

**Time to complete:** 30 minutes  
**Prerequisites:** Basic command-line knowledge

## What You'll Learn

- ✅ Installing and configuring Canvas CLI
- ✅ Understanding the core concepts
- ✅ Using AI agents for development
- ✅ Building a complete application
- ✅ Testing and deployment

## Part 1: Installation and Setup

### Step 1: Install Canvas CLI

Open your terminal and run:

```bash
npm install -g canvas-cli
```

Verify the installation:

```bash
canvas --version
# Output: Canvas CLI v2.0.0
```

### Step 2: Initial Configuration

Run Canvas for the first time:

```bash
canvas
```

You'll see a welcome screen:

```
Welcome to Canvas CLI! 🎨
Let's set up your environment...

? Select your preferred AI provider: (Use arrow keys)
❯ OpenAI (GPT-4, GPT-3.5)
  Anthropic (Claude)
  Google (Gemini)
  Ollama (Local models)
```

Choose your provider and follow the prompts to enter your API key.

### Step 3: Choose a Theme

Canvas CLI offers multiple themes:

```
? Select your preferred theme:
❯ Aurora (Recommended)
  Nebula
  Ocean
  Forest
  Minimal
```

### Step 4: Verify Setup

Test your configuration:

```bash
canvas doctor

✅ Configuration: Valid
✅ API Keys: Configured
✅ Model Access: Connected
✅ File System: Accessible
✅ Git: Installed
```

## Part 2: Your First Canvas Session

### Interactive Mode Basics

Start an interactive session:

```bash
canvas
```

You'll see the Canvas prompt:

```
Canvas CLI v2.0.0 | Theme: Aurora | Model: gpt-4
Type 'help' for commands, 'exit' to quit

canvas>
```

Try your first command:

```bash
canvas> hello

🤖 Assistant: Hello! I'm Canvas CLI, your AI-powered development assistant. 
I can help you with:
- Requirements analysis and planning
- Code generation and refactoring
- Testing and documentation
- Architecture design
- And much more!

What would you like to build today?
```

### Understanding Modes

Canvas CLI has three main modes:

1. **Chat Mode** (default): General interaction
2. **Planning Mode**: Project planning and analysis
3. **Development Mode**: Code execution and generation

Switch to planning mode:

```bash
canvas> /plan
🎯 Entering planning mode. I'll help you plan your project.
```

Switch to development mode:

```bash
canvas> /dev
💻 Entering development mode. Code execution enabled.
```

## Part 3: Building Your First Application

Let's build a simple Todo application using Canvas CLI's agents.

### Step 1: Requirements Analysis

```bash
canvas> analyze requirements for a todo list application with user authentication

🤖 Business Analyst Agent activated...

📋 Requirements Analysis Complete:

FUNCTIONAL REQUIREMENTS:
1. User Registration & Login
   - Email/password authentication
   - Password reset functionality
   - Session management

2. Todo Management
   - Create, read, update, delete todos
   - Mark todos as complete/incomplete
   - Set due dates and priorities
   
3. User Interface
   - List view of todos
   - Filter by status/priority
   - Search functionality

NON-FUNCTIONAL REQUIREMENTS:
- Security: Encrypted passwords, JWT tokens
- Performance: <200ms response time
- Scalability: Support 1000+ concurrent users
- Usability: Mobile-responsive design
```

### Step 2: Create User Stories

```bash
canvas> create user stories from these requirements

🤖 Creating user stories...

USER STORIES:
1. As a new user, I want to register an account, so that I can save my todos
   - AC: Email validation, password strength check, confirmation email

2. As a registered user, I want to log in, so that I can access my todos
   - AC: Secure authentication, session persistence, logout option

3. As a user, I want to create todos, so that I can track my tasks
   - AC: Title required, description optional, due date setting

[... more stories generated ...]
```

### Step 3: Design Architecture

```bash
canvas> design architecture for todo application

🤖 Solutions Architect Agent activated...

🏗️ Architecture Design:

SYSTEM ARCHITECTURE:
- Type: RESTful API with SPA frontend
- Pattern: MVC with Repository pattern

COMPONENTS:
1. Frontend (React)
   - Components: Login, TodoList, TodoItem, TodoForm
   - State Management: Context API
   - Routing: React Router

2. Backend (Node.js/Express)
   - Controllers: AuthController, TodoController
   - Services: AuthService, TodoService
   - Middleware: Authentication, Validation, Error Handling

3. Database (PostgreSQL)
   - Tables: users, todos, sessions
   - Indexes: email, user_id, created_at

4. Infrastructure
   - Deployment: Docker containers
   - Hosting: AWS ECS
   - CDN: CloudFront
```

### Step 4: Generate Code

```bash
canvas> generate backend API for todo application

🤖 Developer Agent activated...

💻 Generating code...
```

**Generated: `server.js`**
```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/todos', todoRoutes);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Generated: `routes/todos.js`**
```javascript
const router = require('express').Router();
const authenticate = require('../middleware/auth');
const TodoController = require('../controllers/TodoController');

router.use(authenticate);

router.get('/', TodoController.getAllTodos);
router.post('/', TodoController.createTodo);
router.get('/:id', TodoController.getTodoById);
router.put('/:id', TodoController.updateTodo);
router.delete('/:id', TodoController.deleteTodo);

module.exports = router;
```

### Step 5: Create Tests

```bash
canvas> generate tests for todo API

🤖 QA Engineer Agent activated...

🧪 Generating test suite...
```

**Generated: `tests/todos.test.js`**
```javascript
const request = require('supertest');
const app = require('../server');

describe('Todo API', () => {
  let authToken;
  
  beforeAll(async () => {
    // Setup test user and get token
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test123!' });
    authToken = response.body.token;
  });

  describe('GET /api/todos', () => {
    it('should return all todos for authenticated user', async () => {
      const response = await request(app)
        .get('/api/todos')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/todos')
        .expect(401);
    });
  });

  describe('POST /api/todos', () => {
    it('should create a new todo', async () => {
      const newTodo = {
        title: 'Test Todo',
        description: 'Test Description',
        priority: 'high'
      };

      const response = await request(app)
        .post('/api/todos')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newTodo)
        .expect(201);
      
      expect(response.body.title).toBe(newTodo.title);
      expect(response.body.id).toBeDefined();
    });
  });
});
```

### Step 6: Run and Test

```bash
canvas> execute npm init -y && npm install express cors helmet jsonwebtoken bcrypt

💻 Executing: npm init -y && npm install express cors helmet jsonwebtoken bcrypt
✅ Package.json created
✅ Dependencies installed

canvas> execute npm test

💻 Executing: npm test
Running tests...
✅ 15 passed
⏭️ 0 skipped
❌ 0 failed
```

## Part 4: Advanced Features

### Using Multiple Agents

Canvas CLI agents can work together:

```bash
canvas> plan sprint for todo application

🤖 Scrum Master Agent activated...

📅 Sprint Planning:

SPRINT 1: Authentication & Basic CRUD (2 weeks)
- User registration (3 points)
- User login (2 points)
- Create/Read todos (5 points)
- Update/Delete todos (3 points)

SPRINT 2: Advanced Features (2 weeks)
- Todo categories (3 points)
- Due dates & reminders (5 points)
- Search & filtering (3 points)
- Export functionality (2 points)
```

### Code Review

```bash
canvas> review code in ./src

🤖 Code Review Agent activated...

📝 Code Review Results:

QUALITY METRICS:
- Maintainability: 85/100
- Complexity: Low
- Test Coverage: 78%
- Documentation: Good

ISSUES FOUND:
1. [HIGH] Missing input validation in TodoController.createTodo
2. [MEDIUM] No rate limiting on API endpoints
3. [LOW] Inconsistent error message format

RECOMMENDATIONS:
- Add input validation middleware
- Implement rate limiting with express-rate-limit
- Standardize error response format
```

### Documentation Generation

```bash
canvas> generate API documentation

🤖 Technical Writer Agent activated...

📚 Generating documentation...

Created: API.md
Created: README.md
Created: CONTRIBUTING.md
```

## Part 5: Tips and Best Practices

### 1. Effective Prompting

Be specific with your requests:

```bash
# Good ✅
canvas> generate React component for todo list with drag-and-drop sorting using react-beautiful-dnd

# Too vague ❌
canvas> make todo list
```

### 2. Iterative Development

Build incrementally:

```bash
canvas> generate basic todo model
canvas> add validation to todo model
canvas> add relationships to user model
canvas> generate migration files
```

### 3. Use Context

Provide context for better results:

```bash
canvas> Given our todo app uses PostgreSQL and Express, generate a repository pattern implementation for todos
```

### 4. Leverage Planning Mode

For complex projects:

```bash
canvas> /plan
canvas> plan microservices architecture for scaling our todo app to 1M users
```

### 5. Test-Driven Development

Generate tests first:

```bash
canvas> generate test cases for user authentication
canvas> implement authentication based on these tests
```

## Part 6: Troubleshooting

### Common Issues and Solutions

#### API Rate Limits

```bash
canvas> # Error: Rate limit exceeded

# Solution: Switch to a different model
canvas> config model --use gpt-3.5-turbo
```

#### File Access Errors

```bash
canvas> # Error: Cannot read file

# Solution: Check permissions
canvas> doctor --check-permissions
```

#### Model Timeout

```bash
canvas> # Error: Request timeout

# Solution: Reduce scope or increase timeout
canvas> config --timeout 60000
```

## Part 7: Next Steps

### Explore More Agents

Try specialized agents:

```bash
# Security analysis
canvas> security scan ./src

# Performance optimization
canvas> optimize performance for ./api

# Database design
canvas> design database schema for e-commerce platform
```

### Customize Your Environment

```bash
# Create custom commands
canvas> alias "review" "security scan && test && lint"

# Set up automation
canvas> automate daily --command "test && report"
```

### Join the Community

- Discord: [discord.gg/canvas-cli](https://discord.gg/canvas-cli)
- GitHub: [github.com/canvas-cli/canvas](https://github.com/canvas-cli/canvas)
- Forum: [community.canvas-cli.com](https://community.canvas-cli.com)

## Conclusion

Congratulations! You've completed the Canvas CLI tutorial. You've learned how to:

- ✅ Install and configure Canvas CLI
- ✅ Use different modes and agents
- ✅ Build a complete application
- ✅ Generate tests and documentation
- ✅ Perform code reviews

### Your Journey Continues

Canvas CLI is constantly evolving. Here are some resources to continue learning:

1. **Advanced Tutorials**
   - Building Microservices with Canvas CLI
   - CI/CD Integration Guide
   - Custom Agent Development

2. **Video Courses**
   - Canvas CLI Masterclass
   - AI-Driven Development Workshop

3. **Certification**
   - Canvas CLI Certified Developer
   - Canvas CLI Certified Architect

### Feedback

We'd love to hear about your experience:

```bash
canvas> feedback "This tutorial was helpful!"
```

Happy coding with Canvas CLI! 🚀