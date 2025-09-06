import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  tools?: string[];
}

interface ChatHistoryProps {
  messages: Message[];
  maxHeight?: number;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, maxHeight = 20 }) => {
  const renderMessage = (msg: Message, index: number) => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';
    
    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box>
          {isUser ? (
            <Gradient name="pastel">
              <Text bold>▶ You:</Text>
            </Gradient>
          ) : isSystem ? (
            <Text color="yellow" bold>⚡ System:</Text>
          ) : (
            <Gradient name="mind">
              <Text bold>◆ Canvas:</Text>
            </Gradient>
          )}
          {msg.timestamp && (
            <Text dimColor> {msg.timestamp.toLocaleTimeString()}</Text>
          )}
        </Box>
        
        <Box marginLeft={2} marginTop={0}>
          <Text wrap="wrap">{msg.content}</Text>
        </Box>
        
        {msg.tools && msg.tools.length > 0 && (
          <Box marginLeft={2}>
            <Text dimColor>🔧 Used: </Text>
            <Text color="cyan">{msg.tools.join(', ')}</Text>
          </Box>
        )}
      </Box>
    );
  };

  // Show only recent messages if too many
  const displayMessages = messages.slice(-maxHeight);
  
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">Chat History</Text>
        <Text dimColor> ({messages.length} messages)</Text>
      </Box>
      
      {displayMessages.length === 0 ? (
        <Text dimColor italic>No messages yet. Start a conversation!</Text>
      ) : (
        displayMessages.map(renderMessage)
      )}
    </Box>
  );
};