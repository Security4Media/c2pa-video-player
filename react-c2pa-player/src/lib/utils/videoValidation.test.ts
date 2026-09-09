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

import { describe, expect, it } from 'vitest';
import { buildVideoSelectionValue, getSourceIcon, parseVideoSelection } from './videoValidation';

describe('video selection key round-trip', () => {
  it.each([
    ['input.mp4', 'server'],
    ['input.mp4', 'local'],
    ['CBC live', 'live'],
  ] as const)('builds and parses "%s|%s"', (filename, source) => {
    const key = buildVideoSelectionValue(filename, source);
    expect(key).toBe(`${filename}|${source}`);
    expect(parseVideoSelection(key)).toEqual({ filename, source });
  });
});

describe('getSourceIcon', () => {
  it('returns the right emoji for each source', () => {
    expect(getSourceIcon('local')).toBe('📁 ');
    expect(getSourceIcon('server')).toBe('🌐 ');
    expect(getSourceIcon('live')).toBe('🔴 ');
  });
});
