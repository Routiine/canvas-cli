/**
 * Voice Input
 * Supports transcription via OpenAI Whisper API or local whisper.cpp.
 */

import * as fs from 'fs-extra';

export interface VoiceConfig {
  provider: 'whisper-api' | 'whisper-local' | 'none';
  apiKey?: string;
  language?: string;
  model?: string;
  localBinaryPath?: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  provider: string;
}

export class VoiceInput {
  private config: VoiceConfig;

  constructor(config?: Partial<VoiceConfig>) {
    this.config = {
      provider: config?.provider || 'none',
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY,
      language: config?.language || 'en',
      model: config?.model || 'whisper-1',
      localBinaryPath: config?.localBinaryPath,
    };
  }

  isAvailable(): boolean {
    if (this.config.provider === 'whisper-api') return !!this.config.apiKey;
    if (this.config.provider === 'whisper-local') return !!this.config.localBinaryPath;
    return false;
  }

  /**
   * Transcribe an audio file
   */
  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    switch (this.config.provider) {
      case 'whisper-api':
        return this.transcribeWithApi(audioPath);
      case 'whisper-local':
        return this.transcribeWithLocal(audioPath);
      default:
        throw new Error('No voice provider configured. Set provider to "whisper-api" or "whisper-local"');
    }
  }

  private async transcribeWithApi(audioPath: string): Promise<TranscriptionResult> {
    const axios = (await import('axios')).default;
    const FormData = (await import('form-data')).default;

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));
    formData.append('model', this.config.model || 'whisper-1');
    if (this.config.language) formData.append('language', this.config.language);

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        ...formData.getHeaders(),
      },
      timeout: 60000,
    });

    return {
      text: response.data.text,
      language: response.data.language,
      duration: response.data.duration,
      provider: 'whisper-api',
    };
  }

  private async transcribeWithLocal(audioPath: string): Promise<TranscriptionResult> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const binary = this.config.localBinaryPath || 'whisper';
      const proc = spawn(binary, [
        '--file', audioPath,
        '--language', this.config.language || 'en',
        '--output-txt',
      ], { timeout: 120000 });

      let stdout = '';
      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.on('exit', (code) => {
        if (code === 0) {
          resolve({ text: stdout.trim(), provider: 'whisper-local' });
        } else {
          reject(new Error(`Local whisper failed with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }
}
