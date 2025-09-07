/**
 * Dashboard startup script
 */

import { DashboardServer } from './server.js';
import { CanvasAgentSystem } from '../agents/canvas-agents.js';

async function startDashboard() {
  console.log('🎨 Starting Canvas CLI Dashboard...');
  
  const dashboardConfig = {
    port: 3001,
    host: '0.0.0.0',
    corsOrigin: 'http://localhost:3002',
    apiPrefix: '/api'
  };
  
  const dashboard = new DashboardServer(dashboardConfig);
  
  // Initialize agent system (with demo Ollama URL)
  const agentSystem = new CanvasAgentSystem(
    'http://localhost:11434',
    'llama2',
    'aurora'
  );
  
  // Connect systems
  dashboard.connectAgentSystem(agentSystem);
  
  // Start the server
  await dashboard.start();
  
  console.log('✅ Dashboard server running at http://localhost:3001');
  console.log('🖥️  Dashboard UI available at http://localhost:3002');
}

startDashboard().catch(console.error);