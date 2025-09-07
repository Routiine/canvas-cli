import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Logo } from './components/Logo.js';
import { StatusBar } from './components/StatusBar.js';
import { ChatHistory, Message } from './components/ChatHistory.js';
import { CommandInput } from './components/CommandInput.js';
import Gradient from 'ink-gradient';

interface CanvasAppProps {
  onCommand?: (command: string) => Promise<string>;
  model?: string;
}

const CanvasApp: React.FC<CanvasAppProps> = ({ 
  onCommand, 
  model = 'llama3.2:latest' 
}) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Welcome to Canvas CLI! I\'m your AI-powered development assistant.',
      timestamp: new Date()
    }
  ]);
  const [mode, setMode] = useState<'idle' | 'thinking' | 'executing' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Ready');

  // Handle keyboard shortcuts with useCallback to prevent re-renders
  useInput(useCallback((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  }, []));

  const handleCommand = useCallback(async (input: string) => {
    // Check for special commands
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      exit();
      return;
    }

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Process command
    setMode('thinking');
    setStatusMessage('Processing your request...');
    
    try {
      // Call the actual command handler if provided
      let response = 'Processing command...';
      if (onCommand) {
        response = await onCommand(input);
      } else {
        // Simple demo response
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = `I received: "${input}". How can I help you today?`;
      }

      // Add assistant response
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      setMode('idle');
      setStatusMessage('Ready');
    } catch (error: any) {
      setMode('error');
      setStatusMessage(error.message);
      
      const errorMessage: Message = {
        role: 'system',
        content: `Error: ${error.message}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  }, [onCommand, exit]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      
      <Box marginY={1}>
        <ChatHistory messages={messages} maxHeight={15} />
      </Box>

      <StatusBar 
        mode={mode} 
        message={statusMessage}
        model={model}
      />
      
      <Box marginY={1}>
        <CommandInput 
          onSubmit={handleCommand} 
          isProcessing={mode !== 'idle'}
        />
      </Box>
      
      <Box>
        <Text dimColor>Ctrl+C: Exit • Type 'help' for commands</Text>
      </Box>
    </Box>
  );
};

export default CanvasApp;
