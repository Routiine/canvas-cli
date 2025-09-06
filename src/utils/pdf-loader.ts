/**
 * Safe PDF parser loader that handles the pdf-parse module
 * This module provides a wrapper around pdf-parse to avoid startup errors
 */

let pdfParseModule: any = null;

/**
 * Safely load and parse a PDF buffer
 * @param dataBuffer - The PDF file buffer to parse
 * @returns Parsed PDF data or error message
 */
export async function parsePDF(dataBuffer: Buffer): Promise<{
  text?: string;
  numpages?: number;
  info?: any;
  metadata?: any;
  version?: string;
  error?: string;
}> {
  try {
    // Lazy load pdf-parse only when actually needed
    if (!pdfParseModule) {
      try {
        // Try to load pdf-parse
        pdfParseModule = (await import('pdf-parse')).default;
      } catch (loadError: any) {
        // If pdf-parse fails to load, return a fallback response
        console.warn('Warning: pdf-parse module could not be loaded:', loadError.message);
        return {
          error: 'PDF parsing is currently unavailable. Please ensure pdf-parse is properly installed.',
          text: '',
          numpages: 0
        };
      }
    }

    // Parse the PDF
    const data = await pdfParseModule(dataBuffer);
    return {
      text: data.text,
      numpages: data.numpages,
      info: data.info,
      metadata: data.metadata,
      version: data.version
    };
  } catch (parseError: any) {
    console.error('Error parsing PDF:', parseError.message);
    return {
      error: `Failed to parse PDF: ${parseError.message}`,
      text: '',
      numpages: 0
    };
  }
}

/**
 * Check if PDF parsing is available
 */
export function isPDFParsingAvailable(): boolean {
  return pdfParseModule !== null;
}