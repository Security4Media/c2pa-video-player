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
import { LIVE_STREAMS } from './liveStreams';

describe('LIVE_STREAMS', () => {
  it('has exactly 5 entries', () => {
    expect(LIVE_STREAMS).toHaveLength(5);
  });

  it('has unique names (used as the dropdown selection key)', () => {
    const names = LIVE_STREAMS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has well-formed https URLs pointing at a DASH manifest', () => {
    for (const entry of LIVE_STREAMS) {
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.url).toMatch(/\.mpd$/);
    }
  });
});
