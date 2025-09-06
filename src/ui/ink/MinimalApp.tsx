import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';

const MinimalApp: React.FC = () => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<string[]>(['Welcome to Canvas CLI!']);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      exit();
    }
  });

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;
    
    const userInput = input;
    setInput('');
    setMessages(prev => [...prev, `> ${userInput}`]);
    
    if (userInput.toLowerCase() === 'exit') {
      exit();
      return;
    }
    
    setIsProcessing(true);
    
    // Simulate processing
    setTimeout(() => {
      setMessages(prev => [...prev, `Canvas: Processed "${userInput}"`]);
      setIsProcessing(false);
    }, 500);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">◆ Canvas CLI - Minimal UI ◆</Text>
      
      <Box flexDirection="column" marginY={1} height={10}>
        {messages.slice(-8).map((msg, i) => (
          <Text key={`msg-${i}`}>{msg}</Text>
        ))}
      </Box>
      
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="green">▶ </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={isProcessing ? 'Processing...' : 'Type command...'}
        />
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>ESC or Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};

export default MinimalApp;