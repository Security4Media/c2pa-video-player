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

import type { AdapterKind, MediaSourceDescriptor, MediaSourceOrigin } from './types';

const MONOLITHIC_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.ogg']);
const MONOLITHIC_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/ogg']);
const HLS_MIME_TYPES = new Set(['application/vnd.apple.mpegurl', 'application/x-mpegurl']);
const DASH_MIME_TYPES = new Set(['application/dash+xml']);

// Single source of truth for "what MIME type does this extension imply" -
// previously duplicated as its own hardcoded chain in
// StandalonePlayerPage.tsx's inferMimeType, which drifted from this file's
// separate per-kind extension/MIME sets above.
const EXTENSION_MIME_TYPES: Readonly<Record<string, string>> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.mpd': 'application/dash+xml',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
};

export interface CreateMediaSourceDescriptorInput {
  url: string;
  displayName?: string;
  mimeType?: string | null;
  origin?: MediaSourceOrigin;
}

export function createMediaSourceDescriptor({
  url,
  displayName,
  mimeType = null,
  origin,
}: CreateMediaSourceDescriptorInput): MediaSourceDescriptor {
  return {
    url,
    displayName: displayName ?? url,
    mimeType,
    extension: getUrlExtension(url),
    origin: origin ?? inferSourceOrigin(url),
  };
}

export function detectAdapterKind(source: MediaSourceDescriptor): AdapterKind {
  const mimeType = source.mimeType?.toLowerCase() ?? null;
  const extension = source.extension?.toLowerCase() ?? null;

  if (extension === '.m3u8' || (mimeType !== null && HLS_MIME_TYPES.has(mimeType))) {
    return 'hls-fragmented-fmp4';
  }

  if (extension === '.mpd' || (mimeType !== null && DASH_MIME_TYPES.has(mimeType))) {
    return 'dash-fragmented-fmp4';
  }

  if (
    (extension !== null && MONOLITHIC_EXTENSIONS.has(extension)) ||
    (mimeType !== null && MONOLITHIC_MIME_TYPES.has(mimeType))
  ) {
    return 'monolithic';
  }

  return 'unsupported';
}

/**
 * Extensions this module knows a specific MIME type for. None is a suffix
 * of another, so callers matching against a combined label (rather than a
 * clean URL path, which `getUrlExtension` handles) can check them in any
 * order without ambiguity.
 */
export const KNOWN_MIME_TYPE_EXTENSIONS: readonly string[] = Object.keys(EXTENSION_MIME_TYPES);

export function getMimeTypeForExtension(extension: string): string | undefined {
  return EXTENSION_MIME_TYPES[extension];
}

function getUrlExtension(url: string): string | null {
  const path = stripQueryAndHash(url).split('/').pop() ?? '';
  const dotIndex = path.lastIndexOf('.');

  if (dotIndex < 0) {
    return null;
  }

  return path.slice(dotIndex).toLowerCase();
}

function stripQueryAndHash(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

function inferSourceOrigin(url: string): MediaSourceOrigin {
  if (url.startsWith('blob:')) {
    return 'blob';
  }

  if (url.startsWith('/mp4s/') || url.includes('/mp4s/')) {
    return 'server';
  }

  if (/^https?:\/\//i.test(url)) {
    return 'remote';
  }

  return 'unknown';
}

