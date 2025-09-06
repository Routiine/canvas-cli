import { EventEmitter } from 'events';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 8. Voice Command Interface
export interface VoiceSession {
  id: string;
  isListening: boolean;
  transcripts: Transcript[];
  settings: VoiceSettings;
  startTime: Date;
  commandCount: number;
}

export interface Transcript {
  id: string;
  text: string;
  confidence: number;
  timestamp: Date;
  executed: boolean;
  command?: string;
  result?: any;
}

export interface VoiceSettings {
  language: string;
  continuous: boolean;
  interimResults: boolean;
  wakeWord?: string;
  voiceFeedback: boolean;
  noiseThreshold: number;
  commandTimeout: number;
}

export class VoiceCommandSystem extends EventEmitter {
  private session: VoiceSession | null = null;
  private recognizer: any = null;
  private synthesizer: any = null;
  private storageDir: string;
  private isProcessing: boolean = false;
  private wakeWordActive: boolean = false;
  
  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'voice');
    fs.ensureDirSync(this.storageDir);
  }
  
  async initialize(): Promise<void> {
    console.log(chalk.cyan('🎤 Initializing voice command system...'));
    
    // Check for platform-specific voice recognition
    if (process.platform === 'darwin') {
      await this.initializeMacOS();
    } else if (process.platform === 'win32') {
      await this.initializeWindows();
    } else {
      await this.initializeLinux();
    }
    
    this.session = {
      id: uuidv4(),
      isListening: false,
      transcripts: [],
      settings: {
        language: 'en-US',
        continuous: true,
        interimResults: true,
        wakeWord: 'canvas',
        voiceFeedback: true,
        noiseThreshold: 0.3,
        commandTimeout: 3000
      },
      startTime: new Date(),
      commandCount: 0
    };
    
    console.log(chalk.green('✅ Voice commands ready'));
    console.log(chalk.dim(`   Say "${this.session.settings.wakeWord}" to activate`));
  }
  
  private async initializeMacOS(): Promise<void> {
    // Use macOS Speech Recognition API via AppleScript
    this.recognizer = {
      platform: 'macos',
      start: async () => {
        const script = `
          tell application "System Events"
            keystroke "h" using {command down, shift down}
          end tell
        `;
        await execAsync(`osascript -e '${script}'`);
      },
      stop: async () => {
        // Stop recognition
      }
    };
    
    // Text-to-speech
    this.synthesizer = {
      speak: async (text: string) => {
        await execAsync(`say "${text}"`);
      }
    };
  }
  
  private async initializeWindows(): Promise<void> {
    // Use Windows Speech Recognition API
    this.recognizer = {
      platform: 'windows',
      start: async () => {
        // PowerShell script for speech recognition
        const script = `
          Add-Type -AssemblyName System.Speech
          $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
          $recognizer.SetInputToDefaultAudioDevice()
          $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
          $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
        `;
        
        const child = spawn('powershell', ['-Command', script]);
        
        child.stdout.on('data', (data: Buffer) => {
          this.handleTranscript(data.toString());
        });
      },
      stop: async () => {
        // Stop recognition
      }
    };
    
    // Text-to-speech
    this.synthesizer = {
      speak: async (text: string) => {
        const script = `
          Add-Type -AssemblyName System.Speech
          $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
          $synthesizer.Speak("${text}")
        `;
        await execAsync(`powershell -Command "${script}"`);
      }
    };
  }
  
  private async initializeLinux(): Promise<void> {
    // Use pocketsphinx or other Linux speech recognition
    try {
      await execAsync('which pocketsphinx_continuous');
      
      this.recognizer = {
        platform: 'linux',
        process: null,
        start: async () => {
          const child = spawn('pocketsphinx_continuous', [
            '-inmic', 'yes',
            '-logfn', '/dev/null'
          ]);
          
          child.stdout.on('data', (data: Buffer) => {
            this.handleTranscript(data.toString());
          });
          
          this.recognizer.process = child;
        },
        stop: async () => {
          if (this.recognizer.process) {
            this.recognizer.process.kill();
          }
        }
      };
    } catch (error) {
      console.log(chalk.yellow('⚠️ Speech recognition not available on Linux'));
      console.log(chalk.dim('   Install pocketsphinx for voice commands'));
    }
    
    // Text-to-speech
    this.synthesizer = {
      speak: async (text: string) => {
        try {
          await execAsync(`espeak "${text}"`);
        } catch (error) {
          // Silent fail if espeak not installed
        }
      }
    };
  }
  
  async startListening(): Promise<void> {
    if (!this.session) {
      await this.initialize();
    }
    
    if (this.session!.isListening) {
      console.log(chalk.yellow('⚠️ Already listening'));
      return;
    }
    
    this.session!.isListening = true;
    
    if (this.recognizer) {
      await this.recognizer.start();
      
      console.log(chalk.green('🎤 Listening for voice commands...'));
      console.log(chalk.dim(`   Say "${this.session!.settings.wakeWord}" followed by your command`));
      
      if (this.session!.settings.voiceFeedback) {
        await this.speak('Voice commands activated');
      }
      
      this.emit('listening-started');
    } else {
      console.log(chalk.red('❌ Voice recognition not available'));
    }
  }
  
  async stopListening(): Promise<void> {
    if (!this.session || !this.session.isListening) {
      return;
    }
    
    this.session.isListening = false;
    
    if (this.recognizer) {
      await this.recognizer.stop();
    }
    
    console.log(chalk.yellow('🔇 Stopped listening'));
    
    if (this.session.settings.voiceFeedback) {
      await this.speak('Voice commands deactivated');
    }
    
    this.emit('listening-stopped');
  }
  
  private async handleTranscript(text: string): Promise<void> {
    if (!this.session || !text.trim()) return;
    
    const transcript: Transcript = {
      id: uuidv4(),
      text: text.trim().toLowerCase(),
      confidence: 0.8, // Would come from recognition API
      timestamp: new Date(),
      executed: false
    };
    
    this.session.transcripts.push(transcript);
    
    console.log(chalk.cyan(`🎤 Heard: "${transcript.text}" (${Math.round(transcript.confidence * 100)}%)`));
    
    // Check for wake word
    if (this.session.settings.wakeWord) {
      if (!this.wakeWordActive) {
        if (transcript.text.includes(this.session.settings.wakeWord)) {
          this.wakeWordActive = true;
          console.log(chalk.green('✅ Wake word detected, listening for command...'));
          
          if (this.session.settings.voiceFeedback) {
            await this.speak('Yes?');
          }
          
          // Set timeout for command
          setTimeout(() => {
            if (this.wakeWordActive) {
              this.wakeWordActive = false;
              console.log(chalk.yellow('⏰ Command timeout'));
            }
          }, this.session.settings.commandTimeout);
        }
        return;
      }
    }
    
    // Process command
    if (!this.isProcessing) {
      await this.processVoiceCommand(transcript);
    }
  }
  
  private async processVoiceCommand(transcript: Transcript): Promise<void> {
    this.isProcessing = true;
    this.wakeWordActive = false;
    
    try {
      // Parse natural language to command
      const command = this.parseVoiceCommand(transcript.text);
      
      if (command) {
        transcript.command = command;
        transcript.executed = true;
        this.session!.commandCount++;
        
        console.log(chalk.green(`▶️ Executing: ${command}`));
        
        if (this.session!.settings.voiceFeedback) {
          await this.speak(`Running ${command.split(' ')[0]}`);
        }
        
        // Execute the command
        const { stdout, stderr } = await execAsync(command);
        transcript.result = stdout || stderr;
        
        console.log(chalk.dim(transcript.result));
        
        this.emit('command-executed', transcript);
        
        if (this.session!.settings.voiceFeedback) {
          await this.speak('Command completed');
        }
      } else {
        console.log(chalk.yellow('⚠️ Could not understand command'));
        
        if (this.session!.settings.voiceFeedback) {
          await this.speak('Sorry, I did not understand');
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      
      if (this.session!.settings.voiceFeedback) {
        await this.speak('Command failed');
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  private parseVoiceCommand(text: string): string | null {
    // Command patterns
    const patterns = [
      { pattern: /(?:show|list|display)\s+(?:all\s+)?files/i, command: 'ls -la' },
      { pattern: /(?:what is|show)\s+(?:the\s+)?(?:current\s+)?directory/i, command: 'pwd' },
      { pattern: /(?:go to|change to|navigate to)\s+(.+)\s+(?:directory|folder)/i, command: (m: any) => `cd ${m[1]}` },
      { pattern: /(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:directory|folder)\s+(?:called\s+)?(.+)/i, command: (m: any) => `mkdir ${m[1]}` },
      { pattern: /(?:create|make)\s+(?:a\s+)?(?:new\s+)?file\s+(?:called\s+)?(.+)/i, command: (m: any) => `touch ${m[1]}` },
      { pattern: /(?:delete|remove)\s+(?:the\s+)?file\s+(.+)/i, command: (m: any) => `rm ${m[1]}` },
      { pattern: /(?:show|display)\s+(?:git\s+)?status/i, command: 'git status' },
      { pattern: /(?:commit|save)\s+(?:all\s+)?changes/i, command: 'git add . && git commit -m "Voice commit"' },
      { pattern: /(?:push|upload)\s+(?:to\s+)?(?:remote|github)/i, command: 'git push' },
      { pattern: /(?:pull|download)\s+(?:from\s+)?(?:remote|github)/i, command: 'git pull' },
      { pattern: /(?:run|execute)\s+tests?/i, command: 'npm test' },
      { pattern: /(?:install|add)\s+dependencies/i, command: 'npm install' },
      { pattern: /(?:start|run)\s+(?:the\s+)?(?:dev\s+)?server/i, command: 'npm run dev' },
      { pattern: /(?:build|compile)\s+(?:the\s+)?project/i, command: 'npm run build' },
      { pattern: /clear\s+(?:the\s+)?(?:terminal|screen)/i, command: 'clear' },
      { pattern: /(?:show|what is)\s+(?:the\s+)?time/i, command: 'date' },
      { pattern: /(?:show|display)\s+(?:system\s+)?(?:resource\s+)?usage/i, command: 'top -n 1' },
      { pattern: /(?:search|find|grep)\s+for\s+(.+)/i, command: (m: any) => `grep -r "${m[1]}" .` },
      { pattern: /(?:open|edit)\s+(.+)\s+(?:file)?/i, command: (m: any) => `code ${m[1]}` },
      { pattern: /(?:stop|exit|quit)\s+(?:voice\s+)?(?:commands?)?/i, command: '__stop_voice__' }
    ];
    
    // Try to match patterns
    for (const { pattern, command } of patterns) {
      const match = text.match(pattern);
      if (match) {
        if (typeof command === 'function') {
          return command(match);
        }
        return command;
      }
    }
    
    // Direct command if starts with common commands
    const directCommands = ['ls', 'cd', 'pwd', 'git', 'npm', 'yarn', 'make', 'docker'];
    for (const cmd of directCommands) {
      if (text.startsWith(cmd)) {
        return text;
      }
    }
    
    return null;
  }
  
  async speak(text: string): Promise<void> {
    if (this.synthesizer) {
      try {
        await this.synthesizer.speak(text);
      } catch (error) {
        // Silent fail
      }
    }
  }
  
  async trainCustomCommands(commands: Array<{ phrase: string; command: string }>): Promise<void> {
    const trainingPath = path.join(this.storageDir, 'custom-commands.json');
    
    // Load existing commands
    let existing: any[] = [];
    if (await fs.pathExists(trainingPath)) {
      existing = await fs.readJson(trainingPath);
    }
    
    // Add new commands
    existing.push(...commands);
    
    // Save
    await fs.writeJson(trainingPath, existing, { spaces: 2 });
    
    console.log(chalk.green(`✅ Trained ${commands.length} custom voice commands`));
  }
  
  getTranscripts(limit: number = 20): Transcript[] {
    if (!this.session) return [];
    return this.session.transcripts.slice(-limit);
  }
  
  getStatistics(): any {
    if (!this.session) return null;
    
    const executed = this.session.transcripts.filter(t => t.executed).length;
    const failed = this.session.transcripts.filter(t => !t.executed).length;
    const avgConfidence = this.session.transcripts.reduce((sum, t) => sum + t.confidence, 0) / this.session.transcripts.length || 0;
    
    return {
      totalTranscripts: this.session.transcripts.length,
      commandsExecuted: executed,
      commandsFailed: failed,
      successRate: executed / (executed + failed) || 0,
      averageConfidence: avgConfidence,
      sessionDuration: Date.now() - this.session.startTime.getTime(),
      isListening: this.session.isListening
    };
  }
  
  async exportTranscripts(format: 'json' | 'text' = 'json'): Promise<string> {
    if (!this.session) throw new Error('No active session');
    
    const exportPath = path.join(this.storageDir, `transcripts-${Date.now()}.${format}`);
    
    if (format === 'json') {
      await fs.writeJson(exportPath, this.session.transcripts, { spaces: 2 });
    } else {
      const text = this.session.transcripts
        .map(t => `[${t.timestamp.toISOString()}] ${t.text} ${t.executed ? '✅' : '❌'}`)
        .join('\n');
      await fs.writeFile(exportPath, text);
    }
    
    return exportPath;
  }
}

// Singleton instance
let voiceInstance: VoiceCommandSystem | null = null;

export function getVoiceCommands(): VoiceCommandSystem {
  if (!voiceInstance) {
    voiceInstance = new VoiceCommandSystem();
  }
  return voiceInstance;
}