# Canvas CLI Examples & Recipes

This document provides detailed, practical examples to help you master Canvas CLI. Each recipe includes context, commands, and expected outcomes.

---

## Recipe 1: Summarizing a Document via Piping

This example shows how to pipe the content of a local file directly to the AI for summarization without entering the full interactive mode.

**1. The Source File (`long_document.md`)**

```markdown
# The History of Artificial Intelligence

Artificial Intelligence (AI) has a long and storied history, beginning not with computers, but with philosophers and mathematicians in antiquity who dreamed of creating artificial beings with the capacity for thought. The modern era of AI, however, began in the mid-20th century with the development of the digital computer.

(This document continues for many pages, detailing the Turing test, the Dartmouth Workshop, the first AI winter, the rise of expert systems, and the deep learning revolution...)
```

**2. The Command**

This command uses the `cat` utility to read the file and pipes (`|`) its content to `canvas chat`. The quoted text is the instruction for the AI.

```bash
cat long_document.md | canvas chat "Provide a 3-sentence summary of this document."
```

**3. The Expected Output**

The CLI will stream the AI's response directly to your terminal.

```
Artificial intelligence traces its origins to ancient philosophical dreams of thinking machines, but its modern era began with the advent of digital computers in the mid-20th century. After periods of both rapid advancement and funding shortages known as "AI winters," the field was revitalized by the development of expert systems. The most recent and powerful shift has been the deep learning revolution, which now powers most contemporary AI applications.
```

---

## Recipe 2: AI-Powered Codebase Analysis

Use the powerful `/sentient` commands within the interactive session to get deep insights into your project.

**1. Start the Interactive Session**

Navigate to your project's root directory and run `canvas`.

```bash
canvas
```

**2. Run the Analysis**

Use the `/sentient analyze` command. The AI will automatically read your project structure and provide a high-level overview.

```
> /sentient analyze

🤖 **Canvas CLI:**

Analyzing project `my-web-app`...

I've reviewed your codebase and here is a summary:

- **Project Type**: Full-stack web application (React frontend, Node.js/Express backend).
- **Languages**: TypeScript (70%), JavaScript (20%), CSS (10%).
- **Key Dependencies**: `react`, `express`, `webpack`, `babel`.
- **Structure**: The `src/` directory is well-organized into `client/` and `server/` folders. The `components/` directory contains 35 reusable React components.
- **Potential Issues**: I've identified 3 deprecated dependencies and 5 functions with high cyclomatic complexity.
```

**3. Ask for Specific Optimizations**

Now, ask a follow-up question to get actionable advice.

```
> /sentient optimize "Show me one of the complex functions and suggest a refactor."

🤖 **Canvas CLI:**

Certainly. The `calculateMetrics` function in `src/server/utils/metrics.js` has a complexity score of 18. 

**Original Code:**
```javascript
function calculateMetrics(data) {
  // ... (long, complex function with many nested if/else statements)
}
```

**Suggested Refactor:**

I recommend breaking it down into smaller, more manageable functions using a strategy pattern. This will improve readability and make it easier to test.

```javascript
const metricStrategies = {
  typeA: (item) => { /* ... */ },
  typeB: (item) => { /* ... */ },
};

function calculateMetrics(data) {
  return data.map(item => {
    const strategy = metricStrategies[item.type];
    return strategy ? strategy(item) : null;
  }).filter(Boolean);
}
```
```

---

## Recipe 3: Building a Knowledge Base from a Website

Crawl a website to create a local knowledge base, allowing the AI to answer questions with specific, up-to-date information from that site.

**1. Crawl the Documentation**

This command will crawl the official Express.js website, indexing up to 50 pages.

```bash
canvas crawl https://expressjs.com/ --max 50
```

**2. The Expected Output**

You will see the crawler's progress in real-time.

```
🕷️  Starting web crawler for https://expressjs.com/

[1/50] Crawled /en/starter/installing.html
[2/50] Crawled /en/guide/routing.html
...
[50/50] Reached max pages limit.

✅ Crawled 50 pages.
📁 Knowledge saved to .canvas/knowledge/expressjs.com/
```

**3. Query the Knowledge Base**

Now, start an interactive session and ask a specific question. The AI will use the information it just learned.

```bash
canvas

> "How do I set up middleware for logging requests in Express?"

🤖 **Canvas CLI:**

Based on the Express.js documentation, you can create a simple logger middleware like this. You would place this before your route definitions.

```javascript
const express = require('express');
const app = express();

app.use((req, res, next) => {
  console.log('Time:', Date.now());
  console.log('Request Type:', req.method);
  console.log('Request Path:', req.originalUrl);
  next();
});

// ... your routes here
```
```

---

## Recipe 4: Full File Generation using the Planning System

This recipe demonstrates how to generate a complete file by creating a plan and having the AI execute it.

**1. Enter Interactive Mode and Create a Plan**

```bash
canvas

> /plan create "generate-dockerfile"

🤖 **Canvas CLI:**
Plan `generate-dockerfile` created. What's the first step?
```

**2. Define the Task and Let the AI Generate the Content**

Tell the AI what you want to do. It will generate the content in the chat.

```
> "Generate a multi-stage Dockerfile for a production-ready Node.js application. The app is built with 'npm run build' and runs with 'npm start'."

🤖 **Canvas CLI:**

Excellent idea. Here is a robust, multi-stage Dockerfile for your application:

```dockerfile
# ---- Base Stage ----
FROM node:20-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./

# ---- Dependencies Stage ----
FROM base AS dependencies
RUN npm install --production

# ---- Build Stage ----
FROM base AS build
COPY . .
RUN npm install
RUN npm run build

# ---- Production Stage ----
FROM base AS production
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

EXPOSE 3000
CMD [ "npm", "start" ]
```
```

**3. Add the File to the Plan and Execute**

Now, instruct the AI to write the generated content to a file.

```
> "This looks perfect. Add a task to the plan to write this content to a file named 'Dockerfile'."

🤖 **Canvas CLI:**

Got it. I've added the task to the plan.

> /plan execute

🤖 **Canvas CLI:**

Executing plan `generate-dockerfile`...

[1/1] 📝 Writing to Dockerfile...
✅ Successfully wrote Dockerfile.

Plan `generate-dockerfile` completed successfully.
```

Your project now contains a `Dockerfile` with the generated content.
