import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface MinimalGrayAppProps {
  onCommand?: (command: string) => Promise<string>;
  model?: string;
}

const MinimalGrayApp: React.FC<MinimalGrayAppProps> = ({ onCommand, model = 'llama3.2' }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Array<{content: string, role: string}>>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useInput(useCallback((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  }, []));

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return;
    
    const userInput = input;
    setInput('');
    
    if (userInput.toLowerCase() === 'exit') {
      exit();
      return;
    }
    
    setMessages(prev => [...prev, { content: userInput, role: 'user' }]);
    setIsProcessing(true);
    
    try {
      let response = 'Processing...';
      if (onCommand) {
        response = await onCommand(userInput);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = `Processed: "${userInput}"`;
      }
      
      setMessages(prev => [...prev, { content: response, role: 'assistant' }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { content: `Error: ${error.message}`, role: 'error' }]);
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, onCommand, exit]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Ultra minimal header */}
      <Box marginBottom={1}>
        <Text color="#b0b0b0">canvas</Text>
        <Text color="#606060"> {model}</Text>
      </Box>
      
      {/* Chat messages - minimal styling */}
      <Box flexDirection="column" minHeight={12}>
        {messages.slice(-10).map((msg, i) => (
          <Box key={i}>
            {msg.role === 'user' ? (
              <Text color="#d0d0d0">{msg.content}</Text>
            ) : msg.role === 'error' ? (
              <Text color="#a06060">{msg.content}</Text>
            ) : (
              <Text color="#808080">{msg.content}</Text>
            )}
          </Box>
        ))}
      </Box>
      
      {/* Simple input */}
      <Box marginTop={1}>
        <Text color="#606060">{isProcessing ? '...' : '>'} </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder=""
        />
      </Box>
    </Box>
  );
};

export default MinimalGrayApp;