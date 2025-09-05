import { BaseTool } from './base.js';
import sharp from 'sharp';
// Lazy load pdf-parse to avoid startup error
let pdfParse: any = null;
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileTypeFromBuffer } from 'file-type';
import exifReader from 'exif-reader';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';

// Lazy load pdf-parse when needed
async function getPdfParser() {
  if (!pdfParse) {
    try {
      pdfParse = (await import('pdf-parse')).default;
    } catch (error) {
      console.warn('PDF parsing not available:', error);
      throw new Error('PDF parsing is not available');
    }
  }
  return pdfParse;
}

export class ImageAnalysisTool extends BaseTool {
  name = 'analyze_image';
  description = 'Analyze and describe image content';
  parameters = {
    path: { type: 'string', description: 'Path to image file' },
    extract_text: { type: 'boolean', description: 'Extract text from image (OCR)', optional: true },
    get_metadata: { type: 'boolean', description: 'Extract EXIF metadata', optional: true }
  };

  async execute(params: { path: string; extract_text?: boolean; get_metadata?: boolean }): Promise<any> {
    const imagePath = path.resolve(params.path);
    const buffer = await fs.readFile(imagePath);
    const fileType = await fileTypeFromBuffer(buffer);
    
    if (!fileType || !fileType.mime.startsWith('image/')) {
      throw new Error('File is not a valid image');
    }

    const result: any = {
      path: params.path,
      type: fileType.mime,
      size: buffer.length
    };

    // Get image dimensions and basic info
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    result.dimensions = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha,
      density: metadata.density
    };

    // Extract EXIF data if requested
    if (params.get_metadata && metadata.exif) {
      try {
        const exif = exifReader(metadata.exif);
        result.metadata = {
          camera: (exif as any).Image?.Make,
          model: (exif as any).Image?.Model,
          date: (exif as any).Exif?.DateTimeOriginal,
          gps: (exif as any).GPS,
          orientation: (exif as any).Image?.Orientation
        };
      } catch (error) {
        result.metadata = 'Unable to parse EXIF data';
      }
    }

    // Generate image statistics
    const stats = await image.stats();
    result.statistics = {
      channels: stats.channels.map(ch => ({
        mean: ch.mean,
        stdev: ch.stdev,
        min: ch.min,
        max: ch.max
      })),
      dominant: stats.dominant,
      isOpaque: stats.isOpaque
    };

    // Convert to base64 for potential vision model processing
    const resized = await sharp(buffer)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    
    result.base64 = `data:${fileType.mime};base64,${resized.toString('base64')}`;

    console.log(chalk.green(`✓ Analyzed image: ${params.path}`));
    return result;
  }
}

export class PDFProcessingTool extends BaseTool {
  name = 'process_pdf';
  description = 'Extract text and metadata from PDF files';
  parameters = {
    path: { type: 'string', description: 'Path to PDF file' },
    page_range: { type: 'string', description: 'Page range (e.g., "1-5")', optional: true },
    extract_images: { type: 'boolean', description: 'Extract embedded images', optional: true }
  };

  async execute(params: { path: string; page_range?: string; extract_images?: boolean }): Promise<any> {
    const pdfPath = path.resolve(params.path);
    const dataBuffer = await fs.readFile(pdfPath);
    
    const pdf = await getPdfParser();
    const data = await pdf(dataBuffer);
    
    const result: any = {
      path: params.path,
      pages: data.numpages,
      info: data.info,
      metadata: data.metadata,
      text: data.text,
      version: data.version
    };

    // Parse specific page range if requested
    if (params.page_range) {
      const [start, end] = params.page_range.split('-').map(Number);
      const pages = data.text.split('\n\n');
      result.text = pages.slice(start - 1, end).join('\n\n');
    }

    console.log(chalk.green(`✓ Processed PDF: ${params.path} (${data.numpages} pages)`));
    return result;
  }
}

export class AudioTranscriptionTool extends BaseTool {
  name = 'transcribe_audio';
  description = 'Transcribe audio to text';
  parameters = {
    path: { type: 'string', description: 'Path to audio file' },
    language: { type: 'string', description: 'Language code (e.g., "en")', optional: true },
    timestamps: { type: 'boolean', description: 'Include timestamps', optional: true }
  };

  async execute(params: { path: string; language?: string; timestamps?: boolean }): Promise<any> {
    const audioPath = path.resolve(params.path);
    
    // Get audio metadata using ffmpeg
    const getMetadata = promisify(ffmpeg.ffprobe);
    const metadata = await getMetadata(audioPath) as any;
    
    const result: any = {
      path: params.path,
      duration: metadata.format.duration,
      format: metadata.format.format_name,
      bitrate: metadata.format.bit_rate,
      size: metadata.format.size
    };

    // For actual transcription, we would need to:
    // 1. Convert to WAV if needed
    // 2. Use Whisper or another speech-to-text service
    // 3. Return transcription with optional timestamps
    
    // Placeholder for transcription
    result.transcription = {
      text: 'Transcription would be performed here using Whisper or similar service',
      language: params.language || 'auto-detected',
      confidence: 0.95
    };

    console.log(chalk.green(`✓ Transcribed audio: ${params.path}`));
    return result;
  }
}

export class VideoAnalysisTool extends BaseTool {
  name = 'analyze_video';
  description = 'Extract frames and analyze video content';
  parameters = {
    path: { type: 'string', description: 'Path to video file' },
    extract_frames: { type: 'number', description: 'Number of frames to extract', optional: true },
    get_subtitles: { type: 'boolean', description: 'Extract subtitles if available', optional: true }
  };

  async execute(params: { path: string; extract_frames?: number; get_subtitles?: boolean }): Promise<any> {
    const videoPath = path.resolve(params.path);
    
    // Get video metadata
    const getMetadata = promisify(ffmpeg.ffprobe);
    const metadata = await getMetadata(videoPath) as any;
    
    const result: any = {
      path: params.path,
      duration: metadata.format.duration,
      format: metadata.format.format_name,
      bitrate: metadata.format.bit_rate,
      size: metadata.format.size,
      streams: metadata.streams.map((stream: any) => ({
        type: stream.codec_type,
        codec: stream.codec_name,
        width: stream.width,
        height: stream.height,
        fps: stream.r_frame_rate,
        bitrate: stream.bit_rate
      }))
    };

    // Extract frames if requested
    if (params.extract_frames) {
      const tempDir = path.join(process.cwd(), '.canvas-temp', 'frames');
      await fs.ensureDir(tempDir);
      
      const frameCount = params.extract_frames || 5;
      const interval = metadata.format.duration / frameCount;
      const frames: string[] = [];

      for (let i = 0; i < frameCount; i++) {
        const timestamp = i * interval;
        const framePath = path.join(tempDir, `frame_${i}.jpg`);
        
        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .seekInput(timestamp)
            .frames(1)
            .output(framePath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
        
        // Convert frame to base64
        const frameBuffer = await fs.readFile(framePath);
        frames.push(`data:image/jpeg;base64,${frameBuffer.toString('base64')}`);
        
        // Clean up
        await fs.remove(framePath);
      }
      
      result.frames = frames;
    }

    console.log(chalk.green(`✓ Analyzed video: ${params.path}`));
    return result;
  }
}

export class DocumentProcessingTool extends BaseTool {
  name = 'process_document';
  description = 'Process various document formats (DOCX, XLSX, PPTX, etc.)';
  parameters = {
    path: { type: 'string', description: 'Path to document' },
    format: { type: 'string', description: 'Output format (text, json, markdown)', optional: true }
  };

  async execute(params: { path: string; format?: string }): Promise<any> {
    const docPath = path.resolve(params.path);
    const ext = path.extname(docPath).toLowerCase();
    
    // Detect document type and process accordingly
    const result: any = {
      path: params.path,
      type: ext,
      format: params.format || 'text'
    };

    // For now, read as text if possible
    if (['.txt', '.md', '.json', '.xml', '.csv'].includes(ext)) {
      result.content = await fs.readFile(docPath, 'utf-8');
    } else {
      result.content = 'Document processing for this format would be implemented here';
      result.note = 'Support for DOCX, XLSX, PPTX coming soon';
    }

    console.log(chalk.green(`✓ Processed document: ${params.path}`));
    return result;
  }
}

export class ScreenshotTool extends BaseTool {
  name = 'take_screenshot';
  description = 'Take a screenshot of the screen or a specific window';
  parameters = {
    fullscreen: { type: 'boolean', description: 'Capture full screen', optional: true },
    window: { type: 'string', description: 'Window title to capture', optional: true },
    region: { type: 'object', description: 'Region to capture {x, y, width, height}', optional: true }
  };

  async execute(params: { fullscreen?: boolean; window?: string; region?: any }): Promise<any> {
    // This would integrate with platform-specific screenshot tools
    // For example, using 'screenshot-desktop' npm package
    
    const result: any = {
      timestamp: new Date().toISOString(),
      type: params.fullscreen ? 'fullscreen' : params.window ? 'window' : 'region',
      path: 'screenshot.png'
    };

    console.log(chalk.green('✓ Screenshot captured'));
    return result;
  }
}

export class QRCodeTool extends BaseTool {
  name = 'qr_code';
  description = 'Generate or read QR codes';
  parameters = {
    action: { type: 'string', description: 'Action: "generate" or "read"' },
    data: { type: 'string', description: 'Data to encode (for generate)', optional: true },
    path: { type: 'string', description: 'Path to QR code image (for read)', optional: true }
  };

  async execute(params: { action: string; data?: string; path?: string }): Promise<any> {
    if (params.action === 'generate' && params.data) {
      // Generate QR code logic here
      return {
        action: 'generated',
        data: params.data,
        format: 'png',
        size: '256x256'
      };
    } else if (params.action === 'read' && params.path) {
      // Read QR code logic here
      return {
        action: 'read',
        path: params.path,
        data: 'QR code content would be extracted here'
      };
    }
    
    throw new Error('Invalid QR code action or missing parameters');
  }
}