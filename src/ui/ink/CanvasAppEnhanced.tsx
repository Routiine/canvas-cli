import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Logo } from './components/Logo.js';
import { StatusBar } from './components/StatusBar.js';
import { ChatHistory, Message } from './components/ChatHistory.js';
import { ToolPanel } from './components/ToolPanel.js';
import { CommandInput } from './components/CommandInput.js';
import { FeatureShowcase } from './components/FeatureShowcase.js';
import { LiveMetrics } from './components/LiveMetrics.js';
import SelectInput from 'ink-select-input';
import Gradient from 'ink-gradient';
import { Tabs, Tab } from './components/Tabs.js';

interface CanvasAppEnhancedProps {
  onCommand?: (command: string) => Promise<string>;
  model?: string;
}

const CanvasAppEnhanced: React.FC<CanvasAppEnhancedProps> = ({ 
  onCommand, 
  model = 'llama3.2:latest' 
}) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mode, setMode] = useState<'idle' | 'thinking' | 'executing' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Canvas CLI Ready');
  const [activeTools, setActiveTools] = useState<any[]>([]);
  const [layout, setLayout] = useState<'default' | 'compact' | 'full'>('default');

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
    if (key.ctrl && input === 'l') {
      // Cycle layouts
      const layouts: Array<'default' | 'compact' | 'full'> = ['default', 'compact', 'full'];
      const currentIndex = layouts.indexOf(layout);
      const nextIndex = (currentIndex + 1) % layouts.length;
      setLayout(layouts[nextIndex]);
    }
    if (key.tab && !key.shift) {
      // Next tab
      const tabs = ['dashboard', 'chat', 'tools', 'metrics'];
      const currentIndex = tabs.indexOf(activeTab);
      const nextIndex = (currentIndex + 1) % tabs.length;
      setActiveTab(tabs[nextIndex]);
    }
    if (key.tab && key.shift) {
      // Previous tab
      const tabs = ['dashboard', 'chat', 'tools', 'metrics'];
      const currentIndex = tabs.indexOf(activeTab);
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      setActiveTab(tabs[prevIndex]);
    }
  });

  // Welcome message
  useEffect(() => {
    setMessages([
      {
        role: 'system',
        content: '🎨 Welcome to Canvas CLI! Your AI-powered development assistant with a beautiful Ink interface.',
        timestamp: new Date()
      }
    ]);

    // Simulate some initial tools
    setActiveTools([
      { name: 'file_system', status: 'idle' },
      { name: 'git_integration', status: 'idle' },
      { name: 'web_builder', status: 'idle' },
      { name: 'ai_context', status: 'idle' }
    ]);
  }, []);

  const handleCommand = async (input: string) => {
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
    setStatusMessage('AI is thinking...');
    
    // Simulate tool activation
    const toolsToActivate = ['ai_context', 'file_system'];
    setActiveTools(prev => prev.map(tool => 
      toolsToActivate.includes(tool.name) 
        ? { ...tool, status: 'running' }
        : tool
    ));

    try {
      let response = 'Processing...';
      if (onCommand) {
        response = await onCommand(input);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
        response = `Canvas CLI processed: "${input}"`;
      }

      // Update tools to completed
      setActiveTools(prev => prev.map(tool => 
        tool.status === 'running' 
          ? { ...tool, status: 'completed', result: 'Success' }
          : tool
      ));

      // Add response
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        tools: toolsToActivate
      };
      setMessages(prev => [...prev, assistantMessage]);

      setMode('idle');
      setStatusMessage('Ready');
    } catch (error: any) {
      setMode('error');
      setStatusMessage(error.message);
      
      setActiveTools(prev => prev.map(tool => 
        tool.status === 'running' 
          ? { ...tool, status: 'failed' }
          : tool
      ));
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Box flexDirection={layout === 'compact' ? 'column' : 'row'} gap={1}>
            <Box flexDirection="column" flexGrow={1} gap={1}>
              <FeatureShowcase />
              <ChatHistory messages={messages.slice(-5)} maxHeight={10} />
            </Box>
            {layout !== 'compact' && (
              <Box flexDirection="column" width={40} gap={1}>
                <LiveMetrics />
                <ToolPanel tools={activeTools} title="System Tools" />
              </Box>
            )}
          </Box>
        );
      
      case 'chat':
        return <ChatHistory messages={messages} />;
      
      case 'tools':
        return (
          <Box flexDirection="row" gap={2}>
            <ToolPanel 
              tools={activeTools.filter(t => t.status !== 'idle')} 
              title="Active Tools" 
            />
            <ToolPanel 
              tools={activeTools} 
              title="All Tools" 
            />
          </Box>
        );
      
      case 'metrics':
        return (
          <Box flexDirection="column" gap={1}>
            <LiveMetrics />
            <Box borderStyle="single" borderColor="gray" padding={1}>
              <Text bold color="cyan">Performance Stats</Text>
              <Text>• Average response time: 245ms</Text>
              <Text>• Tokens per minute: 1,250</Text>
              <Text>• Cache hit rate: 87%</Text>
              <Text>• Active connections: 3</Text>
            </Box>
          </Box>
        );
      
      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      
      <Box justifyContent="space-between" marginBottom={1}>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tab value="dashboard">
            <Gradient name="mind">Dashboard</Gradient>
          </Tab>
          <Tab value="chat">Chat</Tab>
          <Tab value="tools">Tools</Tab>
          <Tab value="metrics">Metrics</Tab>
        </Tabs>
        
        <Box>
          <Text dimColor>Layout: </Text>
          <Text color="yellow">{layout}</Text>
          <Text dimColor> (Ctrl+L)</Text>
        </Box>
      </Box>

      <Box minHeight={layout === 'full' ? 30 : 20} marginBottom={1}>
        {renderContent()}
      </Box>

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
      
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>Tab: Navigate • Ctrl+L: Layout • Ctrl+C: Exit</Text>
        <Gradient name="vice">
          <Text>◆ Powered by Neural Network Intelligence ◆</Text>
        </Gradient>
      </Box>
    </Box>
  );
};

export default CanvasAppEnhanced;