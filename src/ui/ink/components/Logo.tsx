import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';

export const Logo: React.FC = () => {
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      <Box flexDirection="column" alignItems="center">
        <Gradient name="cristal">
          <Text bold>╔═══════════════════════════════════════╗</Text>
        </Gradient>
        <Gradient name="cristal">
          <Text bold>║   ╔═══╗ ╔═══╗ ╔╗  ╔╗ ╦   ╦ ╔═══╗ ╔═══╗║</Text>
        </Gradient>
        <Gradient name="vice">
          <Text bold>║   ║     ╠═══╣ ║╚╗╔╝║ ╚╗ ╔╝ ╠═══╣ ╚═══╗║</Text>
        </Gradient>
        <Gradient name="mind">
          <Text bold>║   ╚═══╝ ╝   ╝ ╝ ╚╝ ╝  ╚═╝  ╝   ╝ ╚═══╝║</Text>
        </Gradient>
        <Gradient name="cristal">
          <Text bold>╚═══════════════════════════════════════╝</Text>
        </Gradient>
      </Box>
      <Box marginTop={1}>
        <Gradient name="atlas">
          <Text>command line interface v2.0</Text>
        </Gradient>
      </Box>
    </Box>
  );
};

export const CompactLogo: React.FC = () => {
  return (
    <Box>
      <Gradient name="cristal">
        <Text bold>╦═ Canvas CLI ═╦</Text>
      </Gradient>
    </Box>
  );
};