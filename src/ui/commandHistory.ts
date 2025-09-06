import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import readline from 'readline';

interface HistoryEntry {
  command: string;
  timestamp: Date;
  mode?: 'planning' | 'execution';
  success?: boolean;
}

export class CommandHistory {
  private history: HistoryEntry[] = [];
  private historyFile: string;
  private maxHistorySize: number = 1000;
  private currentIndex: number = -1;
  private tempCommand: string = '';
  
  constructor() {
    // Store history in user's home directory
    const canvasDir = path.join(os.homedir(), '.canvas-cli');
    fs.ensureDirSync(canvasDir);
    this.historyFile = path.join(canvasDir, 'history.json');
    this.loadHistory();
  }
  
  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = fs.readFileSync(this.historyFile, 'utf-8');
        this.history = JSON.parse(data);
        this.currentIndex = this.history.length;
      }
    } catch (error) {
      // Start with empty history if file is corrupted
      this.history = [];
      this.currentIndex = 0;
    }
  }
  
  private saveHistory(): void {
    try {
      // Keep only the most recent entries
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(-this.maxHistorySize);
      }
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
    } catch (error) {
      // Silently fail if we can't save history
    }
  }
  
  add(command: string, mode?: 'planning' | 'execution', success: boolean = true): void {
    if (!command.trim()) return;
    
    // Don't add duplicate consecutive commands
    const lastEntry = this.history[this.history.length - 1];
    if (lastEntry && lastEntry.command === command) {
      return;
    }
    
    const entry: HistoryEntry = {
      command,
      timestamp: new Date(),
      mode,
      success
    };
    
    this.history.push(entry);
    this.currentIndex = this.history.length;
    this.tempCommand = '';
    this.saveHistory();
  }
  
  getPrevious(): string | null {
    if (this.history.length === 0) return null;
    
    // Save current input if we're at the end
    if (this.currentIndex === this.history.length) {
      this.tempCommand = '';
    }
    
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex].command;
    }
    
    return this.history[0]?.command || null;
  }
  
  getNext(): string | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex].command;
    } else if (this.currentIndex < this.history.length) {
      this.currentIndex = this.history.length;
      return this.tempCommand;
    }
    
    return null;
  }
  
  search(query: string): HistoryEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.history.filter(entry => 
      entry.command.toLowerCase().includes(lowerQuery)
    ).slice(-10); // Return last 10 matches
  }
  
  getRecent(count: number = 10): HistoryEntry[] {
    return this.history.slice(-count);
  }
  
  clear(): void {
    this.history = [];
    this.currentIndex = 0;
    this.tempCommand = '';
    this.saveHistory();
  }
  
  // Interactive search mode (Ctrl+R style)
  async interactiveSearch(): Promise<string | null> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      let searchTerm = '';
      let matches: HistoryEntry[] = [];
      let selectedIndex = 0;
      
      const updateDisplay = () => {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        
        if (matches.length > 0) {
          const selected = matches[selectedIndex];
          process.stdout.write(
            chalk.cyan('(reverse-search)') + 
            chalk.gray(`'${searchTerm}'`) + ': ' +
            chalk.white(selected.command)
          );
        } else {
          process.stdout.write(
            chalk.cyan('(reverse-search)') + 
            chalk.gray(`'${searchTerm}'`) + ': ' +
            chalk.red('no matches')
          );
        }
      };
      
      const handleInput = (key: any) => {
        if (key === '\u0003' || key === '\u001b') { // Ctrl+C or ESC
          rl.close();
          resolve(null);
        } else if (key === '\r' || key === '\n') { // Enter
          rl.close();
          resolve(matches[selectedIndex]?.command || null);
        } else if (key === '\u0012') { // Ctrl+R - next match
          if (selectedIndex < matches.length - 1) {
            selectedIndex++;
            updateDisplay();
          }
        } else if (key === '\u0008' || key === '\u007f') { // Backspace
          searchTerm = searchTerm.slice(0, -1);
          matches = this.search(searchTerm);
          selectedIndex = 0;
          updateDisplay();
        } else if (key.length === 1 && key >= ' ') {
          searchTerm += key;
          matches = this.search(searchTerm);
          selectedIndex = 0;
          updateDisplay();
        }
      };
      
      process.stdin.on('data', handleInput);
      updateDisplay();
      
      rl.on('close', () => {
        process.stdin.removeListener('data', handleInput);
      });
    });
  }
  
  // Get statistics about command usage
  getStats(): {
    totalCommands: number;
    uniqueCommands: number;
    mostUsed: Array<{ command: string; count: number }>;
    recentMode: 'planning' | 'execution' | null;
  } {
    const commandCounts = new Map<string, number>();
    
    for (const entry of this.history) {
      const count = commandCounts.get(entry.command) || 0;
      commandCounts.set(entry.command, count + 1);
    }
    
    const mostUsed = Array.from(commandCounts.entries())
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const recentEntry = this.history[this.history.length - 1];
    
    return {
      totalCommands: this.history.length,
      uniqueCommands: commandCounts.size,
      mostUsed,
      recentMode: recentEntry?.mode || null
    };
  }
}

// Singleton instance
let historyInstance: CommandHistory | null = null;

export function getCommandHistory(): CommandHistory {
  if (!historyInstance) {
    historyInstance = new CommandHistory();
  }
  return historyInstance;
}

// Enhanced readline interface with history support
export function createHistoryInterface(): readline.Interface {
  const history = getCommandHistory();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    historySize: 100,
    removeHistoryDuplicates: true
  });
  
  // Add history entries to readline
  const recentCommands = history.getRecent(100);
  for (const entry of recentCommands.reverse()) {
    (rl as any).history?.push(entry.command);
  }
  
  return rl;
}