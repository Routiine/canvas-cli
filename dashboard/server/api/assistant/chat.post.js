import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { message, context = {}, model = 'gpt-4' } = body

  try {
    // Check if Canvas CLI is available
    const canvasPath = path.join(process.cwd(), '..', 'src', 'index.ts')
    
    // Process the message through Canvas CLI if available
    const processedMessage = await processCanvasCommand(message, context)
    
    // Generate AI response based on message type
    const response = await generateAIResponse(message, processedMessage, context)
    
    // Determine emotion based on response
    const emotion = determineEmotion(response.content)
    
    return {
      success: true,
      response: {
        content: response.content,
        emotion: emotion,
        suggestions: response.suggestions || [],
        tools: response.tools || [],
        timestamp: new Date().toISOString()
      }
    }
  } catch (error) {
    console.error('Assistant chat error:', error)
    return {
      success: false,
      error: error.message,
      response: {
        content: "I encountered an error processing your request. Please try again.",
        emotion: 'confused',
        timestamp: new Date().toISOString()
      }
    }
  }
})

async function processCanvasCommand(message, context) {
  // Check for Canvas CLI specific commands
  const commands = {
    'create': 'canvas create',
    'build': 'canvas build',
    'test': 'canvas test',
    'deploy': 'canvas deploy',
    'analyze': 'canvas analyze'
  }
  
  const lowerMessage = message.toLowerCase()
  for (const [key, cmd] of Object.entries(commands)) {
    if (lowerMessage.includes(key)) {
      try {
        const { stdout } = await execAsync(cmd, {
          cwd: path.join(process.cwd(), '..'),
          timeout: 30000
        })
        return { command: cmd, output: stdout }
      } catch (error) {
        return { command: cmd, error: error.message }
      }
    }
  }
  
  return null
}

async function generateAIResponse(message, processedMessage, context) {
  const lowerMessage = message.toLowerCase()
  
  // Command-specific responses
  if (processedMessage) {
    if (processedMessage.error) {
      return {
        content: `I tried to execute "${processedMessage.command}" but encountered an error: ${processedMessage.error}. Let me help you troubleshoot this.`,
        suggestions: [
          'Check if Canvas CLI is properly installed',
          'Verify your project configuration',
          'Review the error logs'
        ],
        tools: ['error-analyzer', 'log-viewer']
      }
    }
    
    return {
      content: `I've executed "${processedMessage.command}" successfully. ${processedMessage.output ? 'Here\'s the output: ' + processedMessage.output.substring(0, 200) : ''}`,
      suggestions: [
        'View full output in terminal',
        'Run follow-up commands',
        'Check task status'
      ],
      tools: ['terminal', 'task-manager']
    }
  }
  
  // Context-aware responses
  if (lowerMessage.includes('help')) {
    return {
      content: "I'm Canvas AI, your development assistant! I can help you with:\n• Creating and managing projects\n• Writing and reviewing code\n• Running tests and deployments\n• Analyzing performance\n• Planning features\n\nJust tell me what you need!",
      suggestions: [
        'Create a new React component',
        'Review my latest code',
        'Run tests',
        'Deploy to production'
      ],
      tools: ['code-generator', 'test-runner', 'deploy-manager']
    }
  }
  
  if (lowerMessage.includes('code') || lowerMessage.includes('create')) {
    return {
      content: "I can help you create code! What would you like to build? I can generate:\n• React/Vue components\n• API endpoints\n• Database schemas\n• Test suites\n• Documentation",
      suggestions: [
        'Create a React component',
        'Generate API endpoint',
        'Write unit tests',
        'Create documentation'
      ],
      tools: ['code-generator', 'template-engine']
    }
  }
  
  if (lowerMessage.includes('debug') || lowerMessage.includes('error')) {
    return {
      content: "I'll help you debug! Please share:\n• The error message\n• The code causing issues\n• What you expected to happen\n\nI can analyze stack traces, suggest fixes, and help identify common issues.",
      suggestions: [
        'Analyze error logs',
        'Review stack trace',
        'Check common issues',
        'Run diagnostic tests'
      ],
      tools: ['debugger', 'error-analyzer', 'log-viewer']
    }
  }
  
  if (lowerMessage.includes('test')) {
    return {
      content: "Let's run your tests! I can:\n• Execute unit tests\n• Run integration tests\n• Perform end-to-end testing\n• Generate test coverage reports\n\nWhich tests would you like to run?",
      suggestions: [
        'Run all tests',
        'Run unit tests only',
        'Generate coverage report',
        'Create new test suite'
      ],
      tools: ['test-runner', 'coverage-analyzer']
    }
  }
  
  if (lowerMessage.includes('deploy') || lowerMessage.includes('production')) {
    return {
      content: "Ready to deploy! I'll help you:\n• Check deployment readiness\n• Run pre-deployment tests\n• Execute deployment pipeline\n• Monitor deployment status\n\nWhich environment are you targeting?",
      suggestions: [
        'Deploy to staging',
        'Deploy to production',
        'Run pre-deployment checks',
        'View deployment history'
      ],
      tools: ['deploy-manager', 'ci-cd-pipeline', 'monitor']
    }
  }
  
  if (lowerMessage.includes('plan') || lowerMessage.includes('feature')) {
    return {
      content: "Let's plan your feature! I can help with:\n• Breaking down requirements\n• Creating user stories\n• Estimating complexity\n• Setting up task boards\n\nWhat feature are you planning?",
      suggestions: [
        'Create user story',
        'Break down into tasks',
        'Estimate complexity',
        'Set up sprint board'
      ],
      tools: ['planner', 'story-mapper', 'task-manager']
    }
  }
  
  // Default response with context awareness
  return {
    content: `I understand you're asking about "${message}". ${context.previousTopic ? `Building on our discussion about ${context.previousTopic}, ` : ''}I'm here to help! Could you provide more details about what you'd like to accomplish?`,
    suggestions: [
      'Tell me more about your project',
      'What specific help do you need?',
      'Show me your code',
      'What is your goal?'
    ],
    tools: ['assistant', 'knowledge-base']
  }
}

function determineEmotion(content) {
  const emotions = {
    happy: ['success', 'great', 'excellent', 'perfect', 'awesome'],
    excited: ['deploy', 'launch', 'create', 'build', 'new'],
    thinking: ['analyze', 'consider', 'review', 'examine', 'investigate'],
    confused: ['error', 'issue', 'problem', 'failed', 'wrong'],
    neutral: ['ready', 'available', 'can', 'will', 'help']
  }
  
  const lowerContent = content.toLowerCase()
  
  for (const [emotion, keywords] of Object.entries(emotions)) {
    if (keywords.some(keyword => lowerContent.includes(keyword))) {
      return emotion
    }
  }
  
  return 'neutral'
}