#!/usr/bin/env tsx
/**
 * Test to verify border displays completely
 */

import { UnifiedBorder } from './src/ui/unifiedBorder.js';

async function testBorderComplete() {
  console.log('\n📐 Testing border completeness...\n');
  
  // Test with different widths
  const widths = [40, 60, 70];
  
  for (const width of widths) {
    console.log(`\nTesting with width: ${width}`);
    console.log('Terminal width:', process.stdout.columns || 'Unknown');
    
    const border = new UnifiedBorder({
      style: 'double',
      width: width,
      useTheme: true,
      showHelp: false,
      showMode: false,
      clearScreen: false
    });
    
    // Draw a simple border to show it's complete
    border.drawSimpleBorder(
      [`Width: ${width} chars`, 'Border should be complete'],
      'TEST BORDER'
    );
  }
  
  console.log('\n\n🎯 Now testing interactive input border:\n');
  
  const interactiveBorder = new UnifiedBorder({
    style: 'double',
    useTheme: true,
    showHelp: true,
    showMode: true,
    clearScreen: false
  });
  
  console.log('Enter "test" to verify the border closes properly:');
  const input = await interactiveBorder.getBorderedInput('>', true);
  
  console.log(`\n✅ You entered: "${input}"`);
  console.log('The border should have displayed completely with all four corners visible.');
  
  process.exit(0);
}

testBorderComplete().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});