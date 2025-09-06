import React, { useState } from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';

interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}

interface TabProps {
  value: string;
  children: React.ReactNode;
}

export const Tab: React.FC<TabProps> = ({ children }) => {
  return <>{children}</>;
};

export const Tabs: React.FC<TabsProps> = ({ value, onChange, children }) => {
  const tabs = React.Children.toArray(children).filter(
    child => React.isValidElement(child) && child.type === Tab
  );

  return (
    <Box>
      {tabs.map((tab: any, index) => {
        const isActive = tab.props.value === value;
        return (
          <Box key={index} marginRight={2}>
            {isActive ? (
              <Gradient name="mind">
                <Text bold underline>{tab.props.children}</Text>
              </Gradient>
            ) : (
              <Text dimColor>
                {tab.props.children}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};