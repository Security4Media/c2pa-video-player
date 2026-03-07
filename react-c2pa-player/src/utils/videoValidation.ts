// Video validation constants and utilities

export const VIDEO_FORMATS = {
  MP4: 'video/mp4',
  WEBM: 'video/webm',
  OGG: 'video/ogg',
} as const;

export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg'] as const;

export const UPLOAD_CONFIG = {
  PROGRESS_DELAY_MS: 50,
  PROGRESS_HIDE_DELAY_MS: 2000,
  COMPLETION_HIDE_DELAY_MS: 1500,
} as const;

export interface VideoValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates if a file is a supported video format
 */
export function isValidVideoFile(file: File): VideoValidationResult {
  // Check MIME type
  if (file.type === VIDEO_FORMATS.MP4) {
    return { isValid: true };
  }

  // Fallback to extension check
  const hasValidExtension = SUPPORTED_VIDEO_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );

  if (hasValidExtension) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: `Unsupported file format. Please select a video file (${SUPPORTED_VIDEO_EXTENSIONS.join(', ')})`,
  };
}

/**
 * Validates URL for CORS issues
 */
export function validateVideoUrl(url: string): VideoValidationResult {
  // Check for CORS issues with file:// protocol
  if (window.location.protocol === 'file:' && !url.startsWith('blob:')) {
    return {
      isValid: false,
      error: 'CORS Error: Cannot load external URLs from file:// protocol',
    };
  }

  if (!url.trim()) {
    return {
      isValid: false,
      error: 'Please enter a valid video URL',
    };
  }

  return { isValid: true };
}

/**
 * Creates a blob URL from a file
 */
export function createBlobUrl(file: File): string {
  const URL = window.URL || window.webkitURL;
  return URL.createObjectURL(file);
}

/**
 * Filters files to only include MP4 videos
 */
export function filterVideoFiles(files: FileList | File[]): File[] {
  const fileArray = Array.from(files);
  return fileArray.filter((file) => isValidVideoFile(file).isValid);
}

/**
 * Generates a display label for a video file
 */
export function getVideoDisplayLabel(file: File, prefix: string = 'Local'): string {
  return `${prefix}: ${file.name}`;
}

/**
 * Parses video selection value (format: "filename|source")
 */
export function parseVideoSelection(value: string): { filename: string; source: string } | null {
  if (!value) return null;

  const [filename, source] = value.split('|');
  return { filename, source };
}

/**
 * Builds video selection value (format: "filename|source")
 */
export function buildVideoSelectionValue(filename: string, source: 'local' | 'server'): string {
  return `${filename}|${source}`;
}
