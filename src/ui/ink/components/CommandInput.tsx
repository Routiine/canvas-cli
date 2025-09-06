import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Gradient from 'ink-gradient';

interface CommandInputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  isProcessing?: boolean;
}

export const CommandInput: React.FC<CommandInputProps> = ({ 
  onSubmit, 
  placeholder = 'Type your message or command...', 
  isProcessing = false 
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    if (value.trim() && !isProcessing) {
      onSubmit(value);
      setValue('');
    }
  };

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Gradient name="pastel">
        <Text bold>▶ </Text>
      </Gradient>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={isProcessing ? 'Processing...' : placeholder}
        focus={!isProcessing}
      />
    </Box>
  );
};