/**
 * Voice Prompting - Speech-to-text input for commands
 * Similar to Kilo Code's voice prompting capabilities
 */

import { Tool } from '../types.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

interface VoiceConfig {
  engine: 'whisper' | 'google' | 'azure' | 'system';
  language: string;
  model?: string;
  apiKey?: string;
}

// Default configuration
let voiceConfig: VoiceConfig = {
  engine: 'whisper',
  language: 'en',
  model: 'base'
};

/**
 * Check if recording tool is available
 */
async function checkRecordingAvailable(): Promise<string | null> {
  // Check for sox (rec command)
  try {
    await execAsync('which rec');
    return 'sox';
  } catch {}

  // Check for arecord (ALSA)
  try {
    await execAsync('which arecord');
    return 'arecord';
  } catch {}

  // Check for ffmpeg
  try {
    await execAsync('which ffmpeg');
    return 'ffmpeg';
  } catch {}

  // macOS: Check for built-in recording
  if (process.platform === 'darwin') {
    return 'afrecord';
  }

  return null;
}

/**
 * Check if Whisper is available
 */
async function checkWhisperAvailable(): Promise<boolean> {
  try {
    await execAsync('which whisper');
    return true;
  } catch {
    return false;
  }
}

/**
 * Record audio to file
 */
async function recordAudio(outputPath: string, durationSeconds: number = 10): Promise<boolean> {
  const recorder = await checkRecordingAvailable();

  if (!recorder) {
    throw new Error('No audio recording tool found. Install sox, arecord, or ffmpeg.');
  }

  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];

    switch (recorder) {
      case 'sox':
        command = 'rec';
        args = ['-r', '16000', '-c', '1', outputPath, 'trim', '0', String(durationSeconds)];
        break;
      case 'arecord':
        command = 'arecord';
        args = ['-d', String(durationSeconds), '-r', '16000', '-c', '1', '-f', 'S16_LE', outputPath];
        break;
      case 'ffmpeg':
        command = 'ffmpeg';
        args = ['-f', 'alsa', '-i', 'default', '-t', String(durationSeconds), '-ar', '16000', '-ac', '1', outputPath, '-y'];
        break;
      case 'afrecord':
        // macOS - use afrecord or similar
        command = 'rec';
        args = ['-r', '16000', '-c', '1', outputPath, 'trim', '0', String(durationSeconds)];
        break;
      default:
        reject(new Error('Unknown recorder'));
        return;
    }

    // Silent - let the caller handle status messages

    const proc = spawn(command, args, { stdio: 'inherit' });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`Recording failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Transcribe audio using Whisper
 */
async function transcribeWithWhisper(audioPath: string, model: string = 'base'): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `whisper "${audioPath}" --model ${model} --language en --output_format txt --output_dir /tmp`,
      { timeout: 120000 }
    );

    // Read the output file
    const baseName = path.basename(audioPath, path.extname(audioPath));
    const txtPath = `/tmp/${baseName}.txt`;

    if (await fs.pathExists(txtPath)) {
      const text = await fs.readFile(txtPath, 'utf-8');
      await fs.remove(txtPath);
      return text.trim();
    }

    return stdout.trim();
  } catch (error: any) {
    throw new Error(`Whisper transcription failed: ${error.message}`);
  }
}

/**
 * Voice Input Tool
 */
export class VoiceInputTool implements Tool {
  name = 'voice_input';
  description = 'Record voice and convert to text using speech recognition';
  parameters = {
    duration: {
      type: 'number',
      description: 'Recording duration in seconds (default: 10)',
      optional: true
    },
    model: {
      type: 'string',
      description: 'Whisper model: tiny, base, small, medium, large (default: base)',
      optional: true
    }
  };

  async execute(params: { duration?: number; model?: string }): Promise<string> {
    const duration = params.duration || 10;
    const model = params.model || voiceConfig.model || 'base';

    // Check for Whisper
    if (!await checkWhisperAvailable()) {
      return 'Whisper not installed. Install with: pip install openai-whisper';
    }

    // Check for recording capability
    const recorder = await checkRecordingAvailable();
    if (!recorder) {
      return 'No audio recording tool found. Install sox: brew install sox (macOS) or apt install sox (Linux)';
    }

    const tempDir = os.tmpdir();
    const audioFile = path.join(tempDir, `voice-${Date.now()}.wav`);

    try {
      // Record audio
      await recordAudio(audioFile, duration);

      // Transcribe
      const text = await transcribeWithWhisper(audioFile, model);

      // Clean up
      await fs.remove(audioFile);

      if (!text) {
        return 'No speech detected';
      }

      return `Transcribed: ${text}`;
    } catch (error: any) {
      // Clean up on error
      await fs.remove(audioFile).catch(() => {});
      return `Voice input failed: ${error.message}`;
    }
  }
}

/**
 * Voice Command Tool - Execute commands via voice
 */
export class VoiceCommandTool implements Tool {
  name = 'voice_command';
  description = 'Listen for a voice command and execute it';
  parameters = {
    duration: {
      type: 'number',
      description: 'Recording duration in seconds (default: 5)',
      optional: true
    }
  };

  async execute(params: { duration?: number }): Promise<string> {
    const duration = params.duration || 5;

    // Check for Whisper
    if (!await checkWhisperAvailable()) {
      return 'Whisper not installed. Install with: pip install openai-whisper';
    }

    const recorder = await checkRecordingAvailable();
    if (!recorder) {
      return 'No audio recording tool found. Install sox.';
    }

    const tempDir = os.tmpdir();
    const audioFile = path.join(tempDir, `voice-cmd-${Date.now()}.wav`);

    try {
      await recordAudio(audioFile, duration);
      const command = await transcribeWithWhisper(audioFile, 'base');
      await fs.remove(audioFile);

      if (!command) {
        return 'No command detected';
      }

      return `Command: ${command}\n\nUse this command with Canvas CLI or say "execute" to run.`;
    } catch (error: any) {
      await fs.remove(audioFile).catch(() => {});
      return `Voice command failed: ${error.message}`;
    }
  }
}

/**
 * Text to Speech Tool
 */
export class TextToSpeechTool implements Tool {
  name = 'text_to_speech';
  description = 'Convert text to speech (read aloud)';
  parameters = {
    text: {
      type: 'string',
      description: 'Text to speak',
      optional: false
    },
    voice: {
      type: 'string',
      description: 'Voice name (system-dependent)',
      optional: true
    }
  };

  async execute(params: { text: string; voice?: string }): Promise<string> {
    const text = params.text.replace(/['"]/g, '');

    try {
      if (process.platform === 'darwin') {
        // macOS - use say command
        const voice = params.voice ? `-v "${params.voice}"` : '';
        await execAsync(`say ${voice} "${text}"`);
        return 'Text spoken (macOS)';
      } else if (process.platform === 'linux') {
        // Linux - try espeak or festival
        try {
          await execAsync(`espeak "${text}"`);
          return 'Text spoken (espeak)';
        } catch {
          try {
            await execAsync(`echo "${text}" | festival --tts`);
            return 'Text spoken (festival)';
          } catch {
            return 'No TTS engine found. Install espeak: apt install espeak';
          }
        }
      } else if (process.platform === 'win32') {
        // Windows - use PowerShell
        const psCommand = `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${text}')`;
        await execAsync(`powershell -Command "${psCommand}"`);
        return 'Text spoken (Windows)';
      }

      return 'TTS not supported on this platform';
    } catch (error: any) {
      return `TTS failed: ${error.message}`;
    }
  }
}

/**
 * Transcribe File Tool
 */
export class TranscribeFileTool implements Tool {
  name = 'transcribe_file';
  description = 'Transcribe an audio file to text using Whisper';
  parameters = {
    file: {
      type: 'string',
      description: 'Path to audio file (wav, mp3, m4a, etc.)',
      optional: false
    },
    model: {
      type: 'string',
      description: 'Whisper model: tiny, base, small, medium, large',
      optional: true
    },
    language: {
      type: 'string',
      description: 'Language code (e.g., en, es, fr)',
      optional: true
    }
  };

  async execute(params: { file: string; model?: string; language?: string }): Promise<string> {
    if (!await checkWhisperAvailable()) {
      return 'Whisper not installed. Install with: pip install openai-whisper';
    }

    if (!await fs.pathExists(params.file)) {
      return `File not found: ${params.file}`;
    }

    const model = params.model || 'base';
    const language = params.language || 'en';

    try {
      const { stdout } = await execAsync(
        `whisper "${params.file}" --model ${model} --language ${language} --output_format txt`,
        { timeout: 600000 } // 10 minute timeout for large files
      );

      // Read output file
      const baseName = path.basename(params.file, path.extname(params.file));
      const txtPath = `${baseName}.txt`;

      if (await fs.pathExists(txtPath)) {
        const text = await fs.readFile(txtPath, 'utf-8');
        return `Transcription:\n\n${text.trim()}`;
      }

      return stdout || 'Transcription complete';
    } catch (error: any) {
      return `Transcription failed: ${error.message}`;
    }
  }
}

/**
 * Voice Config Tool
 */
export class VoiceConfigTool implements Tool {
  name = 'voice_config';
  description = 'Configure voice recognition settings';
  parameters = {
    engine: {
      type: 'string',
      description: 'Speech engine: whisper (default), google, azure',
      optional: true
    },
    language: {
      type: 'string',
      description: 'Language code (default: en)',
      optional: true
    },
    model: {
      type: 'string',
      description: 'Whisper model (default: base)',
      optional: true
    }
  };

  async execute(params: { engine?: string; language?: string; model?: string }): Promise<string> {
    if (params.engine) voiceConfig.engine = params.engine as any;
    if (params.language) voiceConfig.language = params.language;
    if (params.model) voiceConfig.model = params.model;

    return `Voice configuration:\n  Engine: ${voiceConfig.engine}\n  Language: ${voiceConfig.language}\n  Model: ${voiceConfig.model}`;
  }
}
