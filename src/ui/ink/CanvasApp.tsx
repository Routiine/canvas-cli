import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput, Newline } from 'ink';
import { Logo } from './components/Logo.js';
import { StatusBar } from './components/StatusBar.js';
import { ChatHistory, Message } from './components/ChatHistory.js';
import { ToolPanel } from './components/ToolPanel.js';
import { CommandInput } from './components/CommandInput.js';
import SelectInput from 'ink-select-input';
import Gradient from 'ink-gradient';
import { Alert, Badge, ProgressBar } from '@inkjs/ui';
import { Tabs, Tab } from './components/Tabs.js';

interface CanvasAppProps {
  onCommand?: (command: string) => Promise<string>;
  model?: string;
}

const CanvasApp: React.FC<CanvasAppProps> = ({ onCommand, model }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [mode, setMode] = useState<'idle' | 'thinking' | 'executing' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [activeTools, setActiveTools] = useState<any[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [progress, setProgress] = useState(0);

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
    if (key.ctrl && input === 'm') {
      setShowMenu(!showMenu);
    }
    if (key.tab) {
      // Cycle through tabs
      const tabs = ['chat', 'tools', 'settings', 'help'];
      const currentIndex = tabs.indexOf(activeTab);
      const nextIndex = (currentIndex + 1) % tabs.length;
      setActiveTab(tabs[nextIndex]);
    }
  });

  // Welcome message
  useEffect(() => {
    setMessages([
      {
        role: 'system',
        content: 'Welcome to Canvas CLI! I\'m your AI-powered development assistant.',
        timestamp: new Date()
      }
    ]);
  }, []);

  const handleCommand = async (input: string) => {
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
      // Simulate processing
      setProgress(0);
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Call the actual command handler if provided
      let response = 'Processing command...';
      if (onCommand) {
        response = await onCommand(input);
      } else {
        // Simulate response
        await new Promise(resolve => setTimeout(resolve, 2000));
        response = `I received: "${input}". Canvas CLI is ready to help with your development tasks!`;
      }

      clearInterval(progressInterval);
      setProgress(100);

      // Add assistant response
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        tools: activeTools.filter(t => t.status === 'completed').map(t => t.name)
      };
      setMessages(prev => [...prev, assistantMessage]);

      setMode('idle');
      setStatusMessage('');
      setProgress(0);
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
  };

  const menuItems = [
    { label: 'New Chat', value: 'new' },
    { label: 'Save Conversation', value: 'save' },
    { label: 'Load Conversation', value: 'load' },
    { label: 'Settings', value: 'settings' },
    { label: 'Help', value: 'help' },
    { label: 'Exit', value: 'exit' }
  ];

  const handleMenuSelect = (item: any) => {
    setShowMenu(false);
    switch (item.value) {
      case 'new':
        setMessages([]);
        break;
      case 'exit':
        exit();
        break;
      case 'help':
        setActiveTab('help');
        break;
      case 'settings':
        setActiveTab('settings');
        break;
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'tools':
        return (
          <Box flexDirection="column">
            <ToolPanel tools={activeTools} />
            <Box marginTop={1}>
              <Alert variant="info">
                50+ tools available for file operations, Git, web, and more!
              </Alert>
            </Box>
          </Box>
        );
      
      case 'settings':
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold color="cyan">Settings</Text>
            <Box>
              <Text>Model: </Text>
              <Badge color="magenta">{model}</Badge>
            </Box>
            <Box>
              <Text>Theme: </Text>
              <Badge color="blue">Neural Network</Badge>
            </Box>
            <Box>
              <Text>Auto-save: </Text>
              <Badge color="green">Enabled</Badge>
            </Box>
          </Box>
        );
      
      case 'help':
        return (
          <Box flexDirection="column" gap={1}>
            <Gradient name="mind">
              <Text bold>Canvas CLI Help</Text>
            </Gradient>
            <Text>• Type natural language commands</Text>
            <Text>• Use /help for command list</Text>
            <Text>• Ctrl+M for menu</Text>
            <Text>• Tab to switch panels</Text>
            <Text>• Ctrl+C to exit</Text>
            <Newline />
            <Text bold>Examples:</Text>
            <Text dimColor>• "Create a React component"</Text>
            <Text dimColor>• "Fix the bug in app.js"</Text>
            <Text dimColor>• "Build a landing page"</Text>
            <Text dimColor>• "Explain this code"</Text>
          </Box>
        );
      
      default:
        return <ChatHistory messages={messages} />;
    }
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      
      {showMenu ? (
        <Box flexDirection="column">
          <Text bold color="cyan">Main Menu</Text>
          <SelectInput items={menuItems} onSelect={handleMenuSelect} />
        </Box>
      ) : (
        <>
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tab value="chat">Chat</Tab>
            <Tab value="tools">Tools</Tab>
            <Tab value="settings">Settings</Tab>
            <Tab value="help">Help</Tab>
          </Tabs>

          <Box marginY={1} minHeight={20}>
            {renderTabContent()}
          </Box>

          {progress > 0 && progress < 100 && (
            <Box marginBottom={1}>
              <ProgressBar value={progress} />
            </Box>
          )}

          <StatusBar 
            mode={mode} 
            message={statusMessage}
            tools={activeTools.filter(t => t.status === 'running').map(t => t.name)}
            model={model}
          />
          
          <CommandInput 
            onSubmit={handleCommand} 
            isProcessing={mode !== 'idle'}
          />
          
          <Box marginTop={1}>
            <Text dimColor>Ctrl+M: Menu • Tab: Switch Panels • Ctrl+C: Exit</Text>
          </Box>
        </>
      )}
    </Box>
  );
};

export default CanvasApp;