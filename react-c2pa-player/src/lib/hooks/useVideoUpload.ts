/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
  onVideoLoad: (url: string, displayName: string, videoKey?: string) => void;
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
  reprocessLocalFiles: () => Promise<File[] | undefined>;
  selectVideoByKey: (videoKey: string) => void;
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
   * Selects and loads a video directly by its key (filename|source)
   * Used for programmatic navigation and dropdown selection
   */
  const selectVideoByKey = useCallback(
    (videoKey: string) => {
      const parsed = parseVideoSelection(videoKey);

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
        onVideoLoad(blobUrl, displayName, videoKey);
      } else {
        // Load from server
        const serverPath = `${import.meta.env.BASE_URL}/mp4s/${filename}`;
        onVideoLoad(serverPath, serverPath, videoKey);
      }
    },
    [localVideoFiles, onVideoLoad, onError]
  );

  /**
   * Handles video selection from dropdown
   */
  const handleVideoSelect = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedValue = event.target.value;
      selectVideoByKey(selectedValue);
    },
    [selectVideoByKey]
  );

  /**
   * Re-processes stored local files (for refresh functionality)
   */
  const reprocessLocalFiles = useCallback(async () => {
    if (localVideoFiles.size === 0) {
      onStatusUpdate('No local files to refresh');
      return;
    }

    const filesArray = Array.from(localVideoFiles.values());
    const totalFiles = filesArray.length;

    // Initialize progress
    updateProgress(0, totalFiles, '');

    // Process each file with progress feedback
    for (let i = 0; i < filesArray.length; i++) {
      updateProgress(i, totalFiles, filesArray[i].name);
      await new Promise((resolve) => setTimeout(resolve, UPLOAD_CONFIG.PROGRESS_DELAY_MS));
    }

    // Mark as complete
    updateProgress(totalFiles, totalFiles, 'Complete!');

    onStatusUpdate(`Refreshed ${totalFiles} local video file(s)`);

    // Hide progress after delay
    resetProgressAfterDelay(UPLOAD_CONFIG.PROGRESS_HIDE_DELAY_MS);

    return filesArray;
  }, [localVideoFiles, onStatusUpdate, updateProgress, resetProgressAfterDelay]);

  return {
    uploadProgress,
    localVideoFiles,
    handleFileSelect,
    handleFolderSelect,
    handleVideoSelect,
    validateAndLoadVideo,
    reprocessLocalFiles,
    selectVideoByKey,
  };
}
