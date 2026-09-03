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
import {
  DEFAULT_LIVE_RETENTION_SECONDS,
  MIN_LIVE_WINDOW_SECONDS,
  resolveLiveRetentionSeconds,
  retainedSegmentCount,
} from './liveRetention';

describe('the configured retention', () => {
  it('defaults to five minutes', () => {
    expect(DEFAULT_LIVE_RETENTION_SECONDS).toBe(5 * 60);
    expect(resolveLiveRetentionSeconds(undefined)).toBe(DEFAULT_LIVE_RETENTION_SECONDS);
    expect(resolveLiveRetentionSeconds('')).toBe(DEFAULT_LIVE_RETENTION_SECONDS);
  });

  it('is overridable for a demonstration', () => {
    expect(resolveLiveRetentionSeconds('?window=300')).toBe(300);
    expect(resolveLiveRetentionSeconds('?trust=full&window=120')).toBe(120);
  });

  it('ignores a value it cannot use rather than failing', () => {
    // A diagnostic switch should never be able to break the player.
    for (const search of ['?window=abc', '?window=', '?window=-5', '?window=0']) {
      expect(resolveLiveRetentionSeconds(search)).toBe(DEFAULT_LIVE_RETENTION_SECONDS);
    }
  });

  it('refuses to go below the window floor', () => {
    expect(resolveLiveRetentionSeconds(`?window=${MIN_LIVE_WINDOW_SECONDS - 1}`))
      .toBe(DEFAULT_LIVE_RETENTION_SECONDS);
    expect(resolveLiveRetentionSeconds(`?window=${MIN_LIVE_WINDOW_SECONDS}`))
      .toBe(MIN_LIVE_WINDOW_SECONDS);
  });
});

describe('retainedSegmentCount', () => {
  it('sizes the cache from the retention, pessimistically', () => {
    // Short segments must not silently halve the remembered window.
    expect(retainedSegmentCount(900)).toBe(450);
    expect(retainedSegmentCount(60)).toBe(30);
  });

  it('keeps at least one segment for any usable retention', () => {
    expect(retainedSegmentCount(1)).toBeGreaterThanOrEqual(1);
  });
});
