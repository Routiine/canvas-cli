import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import { Badge } from '@inkjs/ui';

interface Feature {
  icon: string;
  name: string;
  description: string;
  status: 'available' | 'new' | 'beta';
}

const features: Feature[] = [
  {
    icon: '🧠',
    name: 'AI Intelligence',
    description: 'Powered by multiple LLM providers',
    status: 'available'
  },
  {
    icon: '🔧',
    name: '50+ Tools',
    description: 'File, Git, Web, VSCode integration',
    status: 'available'
  },
  {
    icon: '🚀',
    name: 'Web Builder',
    description: 'Create landing pages & apps instantly',
    status: 'new'
  },
  {
    icon: '⚡',
    name: 'Smart Context',
    description: 'Automatic compression & optimization',
    status: 'available'
  },
  {
    icon: '🎨',
    name: 'Beautiful UI',
    description: 'Modern Ink-based terminal interface',
    status: 'new'
  },
  {
    icon: '🔄',
    name: 'Live Reload',
    description: 'Watch files and auto-update context',
    status: 'beta'
  }
];

export const FeatureShowcase: React.FC = () => {
  const [currentFeature, setCurrentFeature] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentFeature((prev) => (prev + 1) % features.length);
        setIsAnimating(false);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const feature = features[currentFeature];

  const getStatusBadge = (status: Feature['status']) => {
    switch (status) {
      case 'new':
        return <Badge color="green">NEW</Badge>;
      case 'beta':
        return <Badge color="yellow">BETA</Badge>;
      default:
        return null;
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={2}
      paddingY={1}
      minHeight={6}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Gradient name="passion">
          <Text bold>Featured Capabilities</Text>
        </Gradient>
        <Box>
          {features.map((_, index) => (
            <Text key={index} color={index === currentFeature ? 'cyan' : 'gray'}>
              {index === currentFeature ? '●' : '○'}
            </Text>
          ))}
        </Box>
      </Box>

      {isAnimating ? (
        <Box justifyContent="center" alignItems="center" height={3}>
          <Spinner type="dots" />
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text>{feature.icon} </Text>
            <Text bold color="cyan">{feature.name}</Text>
            {' '}
            {getStatusBadge(feature.status)}
          </Box>
          <Text dimColor>{feature.description}</Text>
        </Box>
      )}
    </Box>
  );
};