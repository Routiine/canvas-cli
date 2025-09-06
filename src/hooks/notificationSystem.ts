import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';

const execAsync = promisify(exec);

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'completion';

export interface NotificationOptions {
  title?: string;
  message: string;
  type?: NotificationType;
  sound?: boolean;
  desktop?: boolean;
  speech?: boolean;
  persist?: boolean;
  actions?: Array<{ label: string; command: string }>;
}

export class NotificationSystem {
  private platform: string;
  private soundEnabled: boolean = true;
  private desktopEnabled: boolean = true;
  private speechEnabled: boolean = false;
  private notificationHistory: Array<{ timestamp: Date; notification: NotificationOptions }> = [];
  
  constructor() {
    this.platform = os.platform();
    this.loadSettings();
  }
  
  private loadSettings(): void {
    const settingsPath = path.join(os.homedir(), '.canvas-cli', 'notifications.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = fs.readJsonSync(settingsPath);
        this.soundEnabled = settings.soundEnabled ?? true;
        this.desktopEnabled = settings.desktopEnabled ?? true;
        this.speechEnabled = settings.speechEnabled ?? false;
      } catch (error) {
        // Use defaults
      }
    }
  }
  
  async notify(options: NotificationOptions): Promise<void> {
    // Add to history
    this.notificationHistory.push({ timestamp: new Date(), notification: options });
    
    // Console notification (always shown)
    this.showConsoleNotification(options);
    
    // Desktop notification
    if (this.desktopEnabled && options.desktop !== false) {
      await this.showDesktopNotification(options);
    }
    
    // Sound notification
    if (this.soundEnabled && options.sound !== false) {
      await this.playSound(options.type || 'info');
    }
    
    // Text-to-speech
    if (this.speechEnabled && options.speech !== false) {
      await this.speak(options.message);
    }
  }
  
  private showConsoleNotification(options: NotificationOptions): void {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      completion: '🎉'
    };
    
    const colors = {
      info: chalk.blue,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      completion: chalk.magenta
    };
    
    const type = options.type || 'info';
    const icon = icons[type];
    const color = colors[type];
    const title = options.title || type.toUpperCase();
    
    console.log('');
    console.log(color.bold(`  ${icon} ${title}`));
    console.log(color(`  ${options.message}`));
    
    if (options.actions && options.actions.length > 0) {
      console.log(chalk.dim('  Actions:'));
      options.actions.forEach((action, i) => {
        console.log(chalk.dim(`    ${i + 1}. ${action.label} → ${action.command}`));
      });
    }
    console.log('');
  }
  
  private async showDesktopNotification(options: NotificationOptions): Promise<void> {
    const title = options.title || 'Canvas CLI';
    const message = options.message;
    
    try {
      switch (this.platform) {
        case 'darwin': // macOS
          await execAsync(`osascript -e 'display notification "${message}" with title "${title}"'`);
          break;
          
        case 'win32': // Windows
          // Use PowerShell for Windows notifications
          const psCommand = `
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
            
            $template = @"
            <toast>
              <visual>
                <binding template="ToastGeneric">
                  <text>${title}</text>
                  <text>${message}</text>
                </binding>
              </visual>
            </toast>
"@
            
            $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
            $xml.LoadXml($template)
            $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Canvas CLI").Show($toast)
          `.trim();
          
          await execAsync(`powershell -Command "${psCommand}"`);
          break;
          
        case 'linux': // Linux
          // Try notify-send first (most common)
          try {
            await execAsync(`notify-send "${title}" "${message}"`);
          } catch {
            // Fallback to zenity if notify-send not available
            await execAsync(`zenity --notification --text="${title}: ${message}"`);
          }
          break;
      }
    } catch (error) {
      // Silent fail for desktop notifications
    }
  }
  
  private async playSound(type: NotificationType): Promise<void> {
    try {
      switch (this.platform) {
        case 'darwin': // macOS
          const sounds = {
            info: 'Pop',
            success: 'Glass',
            warning: 'Basso',
            error: 'Sosumi',
            completion: 'Hero'
          };
          await execAsync(`afplay /System/Library/Sounds/${sounds[type]}.aiff`);
          break;
          
        case 'win32': // Windows
          // Use PowerShell to play system sounds
          const soundFiles = {
            info: 'Windows Notify System Generic',
            success: 'Windows Navigation Start',
            warning: 'Windows Exclamation',
            error: 'Windows Critical Stop',
            completion: 'Windows Print complete'
          };
          await execAsync(`powershell -c "(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\${soundFiles[type]}.wav').PlaySync();"`);
          break;
          
        case 'linux': // Linux
          // Try paplay (PulseAudio)
          const linuxSounds = {
            info: '/usr/share/sounds/freedesktop/stereo/message.oga',
            success: '/usr/share/sounds/freedesktop/stereo/complete.oga',
            warning: '/usr/share/sounds/freedesktop/stereo/warning.oga',
            error: '/usr/share/sounds/freedesktop/stereo/error.oga',
            completion: '/usr/share/sounds/freedesktop/stereo/service-login.oga'
          };
          
          if (fs.existsSync(linuxSounds[type])) {
            await execAsync(`paplay ${linuxSounds[type]}`);
          } else {
            // Fallback to beep
            await execAsync('echo -e "\\a"');
          }
          break;
      }
    } catch (error) {
      // Silent fail for sounds
    }
  }
  
  private async speak(text: string): Promise<void> {
    try {
      // Sanitize text for shell
      const safeText = text.replace(/['"]/g, '');
      
      switch (this.platform) {
        case 'darwin': // macOS
          await execAsync(`say "${safeText}"`);
          break;
          
        case 'win32': // Windows
          const psScript = `
            Add-Type -AssemblyName System.Speech
            $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
            $speak.Speak("${safeText}")
          `;
          await execAsync(`powershell -Command "${psScript}"`);
          break;
          
        case 'linux': // Linux
          // Try espeak or festival
          try {
            await execAsync(`espeak "${safeText}"`);
          } catch {
            await execAsync(`echo "${safeText}" | festival --tts`);
          }
          break;
      }
    } catch (error) {
      // Silent fail for TTS
    }
  }
  
  // Quick notification methods
  async success(message: string, options?: Partial<NotificationOptions>): Promise<void> {
    await this.notify({ ...options, message, type: 'success' });
  }
  
  async error(message: string, options?: Partial<NotificationOptions>): Promise<void> {
    await this.notify({ ...options, message, type: 'error' });
  }
  
  async warning(message: string, options?: Partial<NotificationOptions>): Promise<void> {
    await this.notify({ ...options, message, type: 'warning' });
  }
  
  async info(message: string, options?: Partial<NotificationOptions>): Promise<void> {
    await this.notify({ ...options, message, type: 'info' });
  }
  
  async completion(message: string, options?: Partial<NotificationOptions>): Promise<void> {
    await this.notify({ ...options, message, type: 'completion' });
  }
  
  // Long-running operation notifications
  async startOperation(operation: string): Promise<() => Promise<void>> {
    await this.info(`Starting: ${operation}`, { sound: false });
    const startTime = Date.now();
    
    return async () => {
      const duration = Date.now() - startTime;
      const durationStr = duration > 60000 
        ? `${Math.round(duration / 60000)} minutes`
        : `${Math.round(duration / 1000)} seconds`;
      
      await this.completion(`Completed: ${operation}`, {
        message: `${operation} completed in ${durationStr}`,
        sound: true,
        desktop: true,
        speech: duration > 30000 // Speak if operation took more than 30 seconds
      });
    };
  }
  
  // Settings management
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.saveSettings();
  }
  
  setDesktopEnabled(enabled: boolean): void {
    this.desktopEnabled = enabled;
    this.saveSettings();
  }
  
  setSpeechEnabled(enabled: boolean): void {
    this.speechEnabled = enabled;
    this.saveSettings();
  }
  
  private saveSettings(): void {
    const settingsPath = path.join(os.homedir(), '.canvas-cli', 'notifications.json');
    const settings = {
      soundEnabled: this.soundEnabled,
      desktopEnabled: this.desktopEnabled,
      speechEnabled: this.speechEnabled
    };
    
    try {
      fs.ensureDirSync(path.dirname(settingsPath));
      fs.writeJsonSync(settingsPath, settings, { spaces: 2 });
    } catch (error) {
      // Silent fail
    }
  }
  
  getHistory(limit: number = 10): typeof this.notificationHistory {
    return this.notificationHistory.slice(-limit);
  }
  
  clearHistory(): void {
    this.notificationHistory = [];
  }
}

// Singleton instance
let notificationInstance: NotificationSystem | null = null;

export function getNotificationSystem(): NotificationSystem {
  if (!notificationInstance) {
    notificationInstance = new NotificationSystem();
  }
  return notificationInstance;
}

// Helper function for quick notifications
export async function notify(message: string, type: NotificationType = 'info'): Promise<void> {
  const system = getNotificationSystem();
  await system.notify({ message, type });
}