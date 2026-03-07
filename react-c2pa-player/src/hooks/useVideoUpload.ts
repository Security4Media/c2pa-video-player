import { useCallback, useState } from 'react';
import {
  isValidVideoFile,
  validateVideoUrl,
  createBlobUrl,
  filterVideoFiles,
  getVideoDisplayLabel,
  parseVideoSelection,
  UPLOAD_CONFIG,
} from '../utils/videoValidation';

interface UploadProgress {
  isLoading: boolean;
  processed: number;
  total: number;
  currentFile: string;
}

interface UseVideoUploadProps {
  onVideoLoad: (url: string, displayName: string) => void;
  onError: (message: string) => void;
  onStatusUpdate: (message: string) => void;
}

interface UseVideoUploadReturn {
  uploadProgress: UploadProgress;
  localVideoFiles: Map<string, File>;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleFolderSelect: (event: React.ChangeEvent<HTMLInputElement>) => Promise<File[] | undefined>;
  handleVideoSelect: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  validateAndLoadVideo: (url: string) => boolean;
}

/**
 * Custom hook to manage video file uploads and selection
 * Handles single files, folders, and URL validation
 */
export function useVideoUpload({
  onVideoLoad,
  onError,
  onStatusUpdate,
}: UseVideoUploadProps): UseVideoUploadReturn {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    isLoading: false,
    processed: 0,
    total: 0,
    currentFile: '',
  });

  // Use lazy initialization for Map (rerender-lazy-state-init)
  const [localVideoFiles, setLocalVideoFiles] = useState(() => new Map<string, File>());

  /**
   * Updates upload progress state
   */
  const updateProgress = useCallback(
    (processed: number, total: number, currentFile: string, isLoading: boolean = true) => {
      setUploadProgress({ isLoading, processed, total, currentFile });
    },
    []
  );

  /**
   * Resets upload progress after a delay
   */
  const resetProgressAfterDelay = useCallback((delayMs: number) => {
    setTimeout(() => {
      setUploadProgress({ isLoading: false, processed: 0, total: 0, currentFile: '' });
    }, delayMs);
  }, []);

  /**
   * Validates URL and loads video if valid
   */
  const validateAndLoadVideo = useCallback(
    (url: string): boolean => {
      const validation = validateVideoUrl(url);

      if (!validation.isValid) {
        onError(validation.error || 'Invalid video URL');
        return false;
      }

      try {
        onVideoLoad(url, url);
        return true;
      } catch (error: any) {
        onError(`Error loading video: ${error.message}`);
        return false;
      }
    },
    [onVideoLoad, onError]
  );

  /**
   * Handles single file selection
   */
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const validation = isValidVideoFile(file);

      if (!validation.isValid) {
        onError(validation.error || 'Invalid video file');
        return;
      }

      const blobUrl = createBlobUrl(file);
      const displayName = getVideoDisplayLabel(file);

      onVideoLoad(blobUrl, displayName);
    },
    [onVideoLoad, onError]
  );

  /**
   * Processes files from folder selection with progress tracking
   */
  const handleFolderSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) {
        onStatusUpdate('No files selected from folder');
        return;
      }

      // Initialize progress
      updateProgress(0, files.length, '');

      // Filter valid video files
      const videoFiles = filterVideoFiles(files);

      // Update progress for each file
      for (let i = 0; i < files.length; i++) {
        updateProgress(i, files.length, files[i].name);
        // Small delay for visual feedback (can be removed for instant loading)
        await new Promise((resolve) => setTimeout(resolve, UPLOAD_CONFIG.PROGRESS_DELAY_MS));
      }

      // Mark as complete
      updateProgress(files.length, files.length, 'Complete!');

      // Handle no valid files found
      if (videoFiles.length === 0) {
        onError('No valid video files found in the selected folder');
        onStatusUpdate('No video files found in selected folder');
        resetProgressAfterDelay(UPLOAD_CONFIG.COMPLETION_HIDE_DELAY_MS);
        return;
      }

      // Store files in state
      const fileMap = new Map(videoFiles.map((file) => [file.name, file]));
      setLocalVideoFiles(fileMap);

      // Load first video automatically
      const firstFile = videoFiles[0];
      const blobUrl = createBlobUrl(firstFile);
      const displayName = getVideoDisplayLabel(firstFile);

      onVideoLoad(blobUrl, displayName);
      onStatusUpdate(`Loaded ${videoFiles.length} video file(s) from folder`);

      // Hide progress after delay
      resetProgressAfterDelay(UPLOAD_CONFIG.PROGRESS_HIDE_DELAY_MS);

      return videoFiles;
    },
    [onVideoLoad, onError, onStatusUpdate, updateProgress, resetProgressAfterDelay]
  );

  /**
   * Handles video selection from dropdown
   */
  const handleVideoSelect = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedValue = event.target.value;
      const parsed = parseVideoSelection(selectedValue);

      if (!parsed) return;

      const { filename, source } = parsed;

      if (source === 'local') {
        // Load from local file
        const file = localVideoFiles.get(filename);

        if (!file) {
          onError(`Local file "${filename}" not found`);
          return;
        }

        const blobUrl = createBlobUrl(file);
        const displayName = getVideoDisplayLabel(file);
        onVideoLoad(blobUrl, displayName);
      } else {
        // Load from server
        const serverPath = `/playlists/mp4s/${filename}`;
        onVideoLoad(serverPath, serverPath);
      }
    },
    [localVideoFiles, onVideoLoad, onError]
  );

  return {
    uploadProgress,
    localVideoFiles,
    handleFileSelect,
    handleFolderSelect,
    handleVideoSelect,
    validateAndLoadVideo,
  };
}
