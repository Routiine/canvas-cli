import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Gradient from 'ink-gradient';
import Spinner from 'ink-spinner';

interface DarkAppProps {
  onCommand?: (command: string) => Promise<string>;
  model?: string;
}

const DarkApp: React.FC<DarkAppProps> = ({ onCommand, model }) => {
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
    <Box flexDirection="column" paddingX={2}>
      {/* Modern dark header */}
      <Box marginY={1}>
        <Gradient name="passion">
          <Text>● CANVAS</Text>
        </Gradient>
        <Text color="gray"> │ </Text>
        <Text dimColor>{model}</Text>
      </Box>
      
      {/* Sleek divider */}
      <Box>
        <Text dimColor>{'─'.repeat(50)}</Text>
      </Box>
      
      {/* Chat area with dark theme */}
      <Box flexDirection="column" marginY={1} minHeight={15}>
        {messages.slice(-10).map((msg, i) => (
          <Box key={i} marginY={0}>
            {msg.role === 'user' ? (
              <Box>
                <Text color="magenta">› </Text>
                <Text color="white">{msg.content}</Text>
              </Box>
            ) : msg.role === 'error' ? (
              <Box>
                <Text color="red">✗ </Text>
                <Text color="red">{msg.content}</Text>
              </Box>
            ) : (
              <Box>
                <Text dimColor>  </Text>
                <Text color="#9333ea">{msg.content}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>
      
      {/* Modern input area */}
      <Box>
        <Text dimColor>{'─'.repeat(50)}</Text>
      </Box>
      
      <Box marginY={1}>
        {isProcessing ? (
          <Box>
            <Spinner type="dots" />
            <Text color="gray"> Processing...</Text>
          </Box>
        ) : (
          <Box>
            <Gradient name="passion">
              <Text>›</Text>
            </Gradient>
            <Text> </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="Enter command..."
            />
          </Box>
        )}
      </Box>
      
      {/* Minimal footer */}
      <Box>
        <Text dimColor>^C exit</Text>
      </Box>
    </Box>
  );
};

export default DarkApp;