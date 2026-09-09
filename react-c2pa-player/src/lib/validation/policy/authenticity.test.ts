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
import { resolveConsentMode, resolveShowAuthenticityLabel } from './authenticity';

describe('?label=off', () => {
  it('is on with no query string at all', () => {
    expect(resolveShowAuthenticityLabel(undefined)).toBe(true);
    expect(resolveShowAuthenticityLabel('')).toBe(true);
  });

  it('stays on unless turned off', () => {
    expect(resolveShowAuthenticityLabel('?window=300')).toBe(true);
  });

  it('is off when asked for', () => {
    expect(resolveShowAuthenticityLabel('?label=off')).toBe(false);
    expect(resolveShowAuthenticityLabel('?trust=full&label=off&gate=off')).toBe(false);
  });

  it('leaves the picture as it is on anything it does not recognise', () => {
    // Same direction as `?gate=off`, deliberately: both fail closed on a
    // typo, since a mistyped value should leave things as they were rather
    // than silently changing what's on screen.
    expect(resolveShowAuthenticityLabel('?label=false')).toBe(true);
    expect(resolveShowAuthenticityLabel('?label=OFF')).toBe(true);
    expect(resolveShowAuthenticityLabel('?label=')).toBe(true);
    expect(resolveShowAuthenticityLabel('?label')).toBe(true);
  });
});

describe('?consent=per-run', () => {
  it('is today’s behaviour by default', () => {
    expect(resolveConsentMode(undefined)).toBe('whole-asset');
    expect(resolveConsentMode('')).toBe('whole-asset');
    expect(resolveConsentMode('?label=on')).toBe('whole-asset');
  });

  it('switches to per-run when asked', () => {
    expect(resolveConsentMode('?consent=per-run')).toBe('per-run');
  });

  it('switches to per-stream when asked', () => {
    expect(resolveConsentMode('?consent=per-stream')).toBe('per-stream');
  });

  it('accepts the default named explicitly', () => {
    expect(resolveConsentMode('?consent=whole-asset')).toBe('whole-asset');
  });

  it('keeps today’s behaviour on anything else', () => {
    expect(resolveConsentMode('?consent=perrun')).toBe('whole-asset');
    expect(resolveConsentMode('?consent=per_stream')).toBe('whole-asset');
    expect(resolveConsentMode('?consent=stream')).toBe('whole-asset');
    expect(resolveConsentMode('?consent=on')).toBe('whole-asset');
    expect(resolveConsentMode('?consent=')).toBe('whole-asset');
  });

  it('is independent of the label', () => {
    // The combination nobody tests by hand.
    expect(resolveConsentMode('?consent=per-run')).toBe('per-run');
    expect(resolveShowAuthenticityLabel('?consent=per-run')).toBe(true);
  });
});
