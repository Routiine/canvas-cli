import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

export const Logo: React.FC = () => {
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      <Gradient name="mind">
        <BigText text="CANVAS" font="chrome" />
      </Gradient>
      <Box marginTop={-1}>
        <Gradient name="vice">
          <Text>◆ ◇ ◆  Neural Network Intelligence  ◆ ◇ ◆</Text>
        </Gradient>
      </Box>
    </Box>
  );
};

export const CompactLogo: React.FC = () => {
  return (
    <Box>
      <Gradient name="cristal">
        <Text bold>◆ Canvas CLI ◆</Text>
      </Gradient>
    </Box>
  );
};