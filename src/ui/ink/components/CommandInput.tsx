import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

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
    <Box>
      <Box borderStyle="single" borderColor="cyan" width="100%" paddingX={1}>
        <Box>
          <Text color="cyan" bold>{'> '}</Text>
          <Box width="100%">
            <TextInput
              value={value}
              onChange={setValue}
              onSubmit={handleSubmit}
              placeholder={isProcessing ? 'Processing...' : placeholder}
              focus={!isProcessing}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};