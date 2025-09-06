import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface Tool {
  name: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  result?: string;
}

interface ToolPanelProps {
  tools: Tool[];
  title?: string;
}

export const ToolPanel: React.FC<ToolPanelProps> = ({ tools, title = 'Active Tools' }) => {
  const getStatusIcon = (status: Tool['status']) => {
    switch (status) {
      case 'running':
        return <Spinner type="dots" />;
      case 'completed':
        return <Text color="green">✓</Text>;
      case 'failed':
        return <Text color="red">✗</Text>;
      default:
        return <Text dimColor>○</Text>;
    }
  };

  const getStatusColor = (status: Tool['status']) => {
    switch (status) {
      case 'running':
        return 'yellow';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="magenta"
      paddingX={1}
      paddingY={1}
      minHeight={8}
    >
      <Text bold color="magenta">{title}</Text>
      
      {tools.length === 0 ? (
        <Text dimColor italic>No tools active</Text>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {tools.map((tool, index) => (
            <Box key={index} marginBottom={0}>
              {getStatusIcon(tool.status)}
              <Text> </Text>
              <Text color={getStatusColor(tool.status)}>{tool.name}</Text>
              {tool.result && (
                <>
                  <Text dimColor>: </Text>
                  <Text dimColor>{tool.result.substring(0, 30)}...</Text>
                </>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};