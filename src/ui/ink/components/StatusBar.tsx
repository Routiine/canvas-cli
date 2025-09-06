import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface StatusBarProps {
  mode: 'idle' | 'thinking' | 'executing' | 'error';
  message?: string;
  tools?: string[];
  model?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ mode, message, tools, model }) => {
  const getModeIcon = () => {
    switch (mode) {
      case 'thinking':
        return <Spinner type="dots" />;
      case 'executing':
        return <Spinner type="bouncingBar" />;
      case 'error':
        return <Text color="red">✗</Text>;
      default:
        return <Text color="green">●</Text>;
    }
  };

  const getModeText = () => {
    switch (mode) {
      case 'thinking':
        return 'Thinking...';
      case 'executing':
        return 'Executing...';
      case 'error':
        return 'Error';
      default:
        return 'Ready';
    }
  };

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      marginTop={1}
      justifyContent="space-between"
    >
      <Box>
        {getModeIcon()}
        <Text> </Text>
        <Text color="cyan" bold>{getModeText()}</Text>
        {message && (
          <>
            <Text> • </Text>
            <Text dimColor>{message}</Text>
          </>
        )}
      </Box>
      
      <Box>
        {tools && tools.length > 0 && (
          <>
            <Text dimColor>Tools: </Text>
            <Text color="yellow">{tools.join(', ')}</Text>
            <Text>  </Text>
          </>
        )}
        {model && (
          <>
            <Text dimColor>Model: </Text>
            <Text color="magenta">{model}</Text>
          </>
        )}
      </Box>
    </Box>
  );
};