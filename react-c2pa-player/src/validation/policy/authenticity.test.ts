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

describe('?label=on', () => {
  it('is off with no query string at all', () => {
    expect(resolveShowAuthenticityLabel(undefined)).toBe(false);
    expect(resolveShowAuthenticityLabel('')).toBe(false);
  });

  it('is off unless asked for', () => {
    expect(resolveShowAuthenticityLabel('?window=300')).toBe(false);
  });

  it('is on when asked for', () => {
    expect(resolveShowAuthenticityLabel('?label=on')).toBe(true);
    expect(resolveShowAuthenticityLabel('?trust=full&label=on&gate=off')).toBe(true);
  });

  it('leaves the picture clear on anything it does not recognise', () => {
    // The opposite way round from `?gate=off`, deliberately: that one fails
    // closed because it disables a protection, this one because it puts
    // something over live output.
    expect(resolveShowAuthenticityLabel('?label=true')).toBe(false);
    expect(resolveShowAuthenticityLabel('?label=ON')).toBe(false);
    expect(resolveShowAuthenticityLabel('?label=')).toBe(false);
    expect(resolveShowAuthenticityLabel('?label')).toBe(false);
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
    expect(resolveShowAuthenticityLabel('?consent=per-run')).toBe(false);
  });
});
