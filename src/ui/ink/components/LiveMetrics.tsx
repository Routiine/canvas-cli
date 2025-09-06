import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from '@inkjs/ui';
import Gradient from 'ink-gradient';

interface Metrics {
  tokensUsed: number;
  tokensLimit: number;
  requestsCount: number;
  activeTools: number;
  responseTime: number;
  memoryUsage: number;
}

export const LiveMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics>({
    tokensUsed: 0,
    tokensLimit: 128000,
    requestsCount: 0,
    activeTools: 0,
    responseTime: 0,
    memoryUsage: 0
  });

  useEffect(() => {
    // Simulate metrics updates
    const interval = setInterval(() => {
      setMetrics(prev => ({
        tokensUsed: Math.min(prev.tokensUsed + Math.random() * 1000, prev.tokensLimit),
        tokensLimit: prev.tokensLimit,
        requestsCount: prev.requestsCount + (Math.random() > 0.7 ? 1 : 0),
        activeTools: Math.floor(Math.random() * 5),
        responseTime: 50 + Math.random() * 450,
        memoryUsage: 30 + Math.random() * 40
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const tokenPercentage = (metrics.tokensUsed / metrics.tokensLimit) * 100;
  const memoryPercentage = metrics.memoryUsage;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="blue"
      paddingX={1}
      paddingY={1}
    >
      <Gradient name="teen">
        <Text bold>Live Metrics</Text>
      </Gradient>

      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text>Tokens</Text>
            <Text dimColor>{Math.floor(metrics.tokensUsed)} / {metrics.tokensLimit}</Text>
          </Box>
          <ProgressBar value={Math.floor(tokenPercentage)} />
        </Box>

        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text>Memory</Text>
            <Text dimColor>{Math.floor(memoryPercentage)}%</Text>
          </Box>
          <ProgressBar value={Math.floor(memoryPercentage)} />
        </Box>

        <Box justifyContent="space-between">
          <Text>Requests</Text>
          <Text color="cyan">{metrics.requestsCount}</Text>
        </Box>

        <Box justifyContent="space-between">
          <Text>Active Tools</Text>
          <Text color="yellow">{metrics.activeTools}</Text>
        </Box>

        <Box justifyContent="space-between">
          <Text>Response Time</Text>
          <Text color={metrics.responseTime < 200 ? 'green' : 'yellow'}>
            {Math.floor(metrics.responseTime)}ms
          </Text>
        </Box>
      </Box>
    </Box>
  );
};