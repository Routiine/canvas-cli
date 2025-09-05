import { Tool } from './types.js';

export function createToolPrompt(userPrompt: string, tools: Tool[]): string {
  const toolDescriptions = tools.map(tool => {
    const params = Object.entries(tool.parameters || {})
      .map(([key, value]: [string, any]) => `    ${key}: ${value.description}${value.optional ? ' (optional)' : ''}`)
      .join('\n');
    
    return `  - ${tool.name}: ${tool.description}${params ? '\n' + params : ''}`;
  }).join('\n');

  return `You are Canvas CLI, an AI assistant with access to various tools to help users.

AVAILABLE TOOLS:
${toolDescriptions}

IMPORTANT: When you need to perform an action, you MUST use the following format:

To use a tool, write:
<tool>tool_name</tool>
<parameters>
{
  "param1": "value1",
  "param2": "value2"
}
</parameters>

For example, to read a file:
<tool>read_file</tool>
<parameters>
{
  "path": "example.txt"
}
</parameters>

Or to write a file:
<tool>write_file</tool>
<parameters>
{
  "path": ".doc/test.md",
  "content": "Hello World"
}
</parameters>

RULES:
1. ALWAYS use tools to perform actions instead of explaining how to do them
2. When asked to read, write, or manipulate files, USE THE TOOLS
3. When asked about the project structure, USE read_file or list_directory tools
4. Do not just explain what you would do - actually DO IT using the tools
5. You can use multiple tools in sequence to complete complex tasks

USER REQUEST: ${userPrompt}

Now, complete the user's request using the available tools. Remember to USE the tools, don't just explain how to use them.`;
}

export function parseToolCalls(response: string): Array<{name: string, parameters: any}> {
  const toolCalls = [];
  
  // Try XML-style format first
  const xmlRegex = /<tool>(.*?)<\/tool>\s*<parameters>([\s\S]*?)<\/parameters>/g;
  let match;
  while ((match = xmlRegex.exec(response)) !== null) {
    const toolName = match[1].trim();
    const parametersStr = match[2].trim();
    
    try {
      const parameters = JSON.parse(parametersStr);
      toolCalls.push({ name: toolName, parameters });
    } catch (error) {
      console.error(`Failed to parse parameters for tool ${toolName}:`, error);
    }
  }
  
  // Try simple format: TOOL: name PARAMS: {...}
  // Split by TOOL: to handle each tool call separately
  const toolSections = response.split(/(?=TOOL:)/g);
  
  for (const section of toolSections) {
    if (!section.includes('TOOL:')) continue;
    
    const toolMatch = section.match(/TOOL:\s*(\w+)/i);
    const paramsMatch = section.match(/PARAMS:\s*(\{[\s\S]*?\})(?=\s*(?:TOOL:|$))/i);
    
    if (toolMatch && paramsMatch) {
      const toolName = toolMatch[1].trim();
      const parametersStr = paramsMatch[1].trim();
      
      try {
        const parameters = JSON.parse(parametersStr);
        // Check if this tool call is already in the list (avoid duplicates)
        const isDuplicate = toolCalls.some(tc => 
          tc.name === toolName && JSON.stringify(tc.parameters) === JSON.stringify(parameters)
        );
        if (!isDuplicate) {
          toolCalls.push({ name: toolName, parameters });
          console.log(`🔧 Parsed tool call: ${toolName}`);
        }
      } catch (error) {
        console.error(`Failed to parse parameters for tool ${toolName}: ${error}`);
        console.error(`Parameters string was: ${parametersStr.substring(0, 200)}...`);
      }
    }
  }
  
  // Try an alternative parsing approach for JSON with nested quotes
  // Look for balanced braces after PARAMS:
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
          console.log(`🔧 Parsed tool call (balanced): ${toolName}`);
        }
      } catch (error) {
        // Silent fail
      }
    }
  }
  
  console.log(`🔍 Found ${toolCalls.length} tool call(s) in response`);
  return toolCalls;
}