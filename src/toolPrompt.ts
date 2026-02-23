import { Tool } from './types.js';

/**
 * Create a simple, universal tool prompt that works with any model
 */
export function createToolPrompt(userPrompt: string, tools: Tool[]): string {
  // Only essential tools to keep prompt short
  const essentialTools = ['run_shell_command', 'write_file', 'read_file', 'edit_file', 'list_directory'];
  const coreTools = tools.filter(t => essentialTools.includes(t.name));

  const toolList = coreTools.map(t => `${t.name}: ${t.description}`).join('\n');

  return `Use tools to complete tasks.

Tools:
${toolList}

Format:
TOOL: tool_name
PARAMS: {"key": "value"}

Example:
TOOL: run_shell_command
PARAMS: {"command": "mkdir -p ~/Documents/test"}

TOOL: write_file
PARAMS: {"path": "~/Documents/test/hello.html", "content": "<!DOCTYPE html><html><body><h1>Hello World</h1></body></html>"}

Task: ${userPrompt}

Execute now:`;
}

/**
 * Create a simple, universal tool prompt that works with any model
 */
export function createClaudeStyleToolPrompt(userPrompt: string, tools: Tool[]): string {
  // Only include essential tools to keep prompt short
  const essentialTools = ['run_shell_command', 'write_file', 'read_file', 'edit_file', 'list_directory'];
  const coreTools = tools.filter(t => essentialTools.includes(t.name));

  const toolList = coreTools.map(t => `${t.name}: ${t.description}`).join('\n');

  return `You are an AI assistant. Use tools to complete tasks.

Tools:
${toolList}

Format - use exactly:
TOOL: tool_name
PARAMS: {"key": "value"}

Examples:
TOOL: run_shell_command
PARAMS: {"command": "mkdir -p test"}

TOOL: write_file
PARAMS: {"path": "test/hello.html", "content": "<html><body>Hello</body></html>"}

Task: ${userPrompt}

Execute the task using the tools above. Output TOOL/PARAMS directly.`;
}

export function parseToolCalls(response: string): Array<{name: string, parameters: any}> {
  const toolCalls: Array<{name: string, parameters: any}> = [];

  // Helper to add tool call if not duplicate
  const addToolCall = (name: string, params: any) => {
    const isDuplicate = toolCalls.some(tc =>
      tc.name === name && JSON.stringify(tc.parameters) === JSON.stringify(params)
    );
    if (!isDuplicate) {
      toolCalls.push({ name, parameters: params });
      // Debug output removed for cleaner UX
    }
  };

  // Try XML-style format first
  const xmlRegex = /<tool>(.*?)<\/tool>\s*<parameters>([\s\S]*?)<\/parameters>/g;
  let match;
  while ((match = xmlRegex.exec(response)) !== null) {
    const toolName = match[1].trim();
    const parametersStr = match[2].trim();
    try {
      const parameters = JSON.parse(parametersStr);
      addToolCall(toolName, parameters);
    } catch (error) {
      // Ignore parse errors
    }
  }

  // Try bracket format: [TOOL: name] {...} or [TOOL: name] PARAMS: {...}
  const bracketRegex = /\[TOOL:\s*(\w+)\](?:\s*PARAMS:)?\s*(\{[\s\S]*?\})/gi;
  while ((match = bracketRegex.exec(response)) !== null) {
    const toolName = match[1].trim();
    const parametersStr = match[2].trim();
    try {
      const parameters = JSON.parse(parametersStr);
      addToolCall(toolName, parameters);
    } catch (error) {
      // Try balanced brace extraction for complex JSON
    }
  }

  // Try inline format: TOOL: name PARAMS: {...} (on same line)
  const inlineRegex = /TOOL:\s*(\w+)\s*PARAMS:\s*(\{[^}]+\})/gi;
  while ((match = inlineRegex.exec(response)) !== null) {
    const toolName = match[1].trim();
    const parametersStr = match[2].trim();
    try {
      const parameters = JSON.parse(parametersStr);
      addToolCall(toolName, parameters);
    } catch (error) {
      // Try to fix common JSON issues (unescaped quotes, etc.)
      try {
        const fixed = parametersStr.replace(/\\n/g, '\\\\n');
        const parameters = JSON.parse(fixed);
        addToolCall(toolName, parameters);
      } catch (e) {
        console.log(`⚠️ Could not parse params for ${toolName}: ${parametersStr.substring(0, 50)}...`);
      }
    }
  }

  // Try multiline format: TOOL: name\nPARAMS: {...}
  const multilineRegex = /TOOL:\s*(\w+)\s*\n\s*PARAMS:\s*(\{[\s\S]*?\})/gi;
  while ((match = multilineRegex.exec(response)) !== null) {
    const toolName = match[1].trim();
    const parametersStr = match[2].trim();
    try {
      const parameters = JSON.parse(parametersStr);
      addToolCall(toolName, parameters);
    } catch (error) {
      // Ignore
    }
  }

  // Try to find tool calls inside markdown code blocks
  const codeBlockRegex = /```[\s\S]*?TOOL:\s*(\w+)(?:\s+PARAMS:|\s*\n\s*PARAMS:)\s*(\{[\s\S]*?\})[\s\S]*?```/gi;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const toolName = match[1].trim();
    const parametersStr = match[2].trim();
    try {
      const parameters = JSON.parse(parametersStr);
      addToolCall(toolName, parameters);
    } catch (error) {
      // Ignore
    }
  }
  
  // Try an alternative parsing approach for JSON with nested braces/quotes
  // This handles inline format: TOOL: name PARAMS: {...} with balanced braces
  const inlineAltRegex = /TOOL:\s*(\w+)\s+PARAMS:\s*/g;
  let inlineAltMatch;
  while ((inlineAltMatch = inlineAltRegex.exec(response)) !== null) {
    const toolName = inlineAltMatch[1].trim();
    const startIdx = inlineAltMatch.index + inlineAltMatch[0].length;

    // Find balanced braces
    let braceCount = 0;
    let endIdx = startIdx;
    let inString = false;
    let escapeNext = false;

    for (let i = startIdx; i < response.length; i++) {
      const char = response[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }
    }

    if (endIdx > startIdx) {
      const parametersStr = response.substring(startIdx, endIdx);
      try {
        const parameters = JSON.parse(parametersStr);
        addToolCall(toolName, parameters);
      } catch (error) {
        // Silent fail - try other parsers
      }
    }
  }

  // Look for balanced braces after PARAMS: (multiline format)
  const altRegex = /TOOL:\s*(\w+)\s*\n\s*PARAMS:\s*/g;
  let altMatch;
  while ((altMatch = altRegex.exec(response)) !== null) {
    const toolName = altMatch[1].trim();
    const startIdx = altMatch.index + altMatch[0].length;
    
    // Find balanced braces
    let braceCount = 0;
    let endIdx = startIdx;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startIdx; i < response.length; i++) {
      const char = response[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }
    }
    
    if (endIdx > startIdx) {
      const parametersStr = response.substring(startIdx, endIdx);
      try {
        const parameters = JSON.parse(parametersStr);
        const isDuplicate = toolCalls.some(tc => 
          tc.name === toolName && JSON.stringify(tc.parameters) === JSON.stringify(parameters)
        );
        if (!isDuplicate) {
          toolCalls.push({ name: toolName, parameters });
        }
      } catch (error) {
        // Silent fail
      }
    }
  }

  return toolCalls;
}