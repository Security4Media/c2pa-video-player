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
import { resolveIdentityTrustMode, resolveShowCreativeWork, resolveShowUnverifiedIdentity } from './menuDisplay';

describe('resolveIdentityTrustMode', () => {
  it('is relaxed with no query string at all', () => {
    expect(resolveIdentityTrustMode(undefined)).toBe('relaxed');
    expect(resolveIdentityTrustMode('')).toBe('relaxed');
  });

  it('is relaxed unless strict is asked for', () => {
    expect(resolveIdentityTrustMode('?window=300')).toBe('relaxed');
  });

  it('is strict only for the exact value', () => {
    expect(resolveIdentityTrustMode('?identityTrust=strict')).toBe('strict');
    expect(resolveIdentityTrustMode('?trust=full&identityTrust=strict&gate=off')).toBe('strict');
  });

  it('stays relaxed on anything it does not recognise, including a typo', () => {
    expect(resolveIdentityTrustMode('?identityTrust=Strict')).toBe('relaxed');
    expect(resolveIdentityTrustMode('?identityTrust=on')).toBe('relaxed');
  });
});

describe('resolveShowCreativeWork', () => {
  it('is on with no query string at all', () => {
    expect(resolveShowCreativeWork(undefined)).toBe(true);
    expect(resolveShowCreativeWork('')).toBe(true);
  });

  it('is on unless explicitly turned off', () => {
    expect(resolveShowCreativeWork('?window=300')).toBe(true);
  });

  it('is off only for the exact value', () => {
    expect(resolveShowCreativeWork('?showCreativeWork=off')).toBe(false);
    expect(resolveShowCreativeWork('?trust=full&showCreativeWork=off&gate=off')).toBe(false);
  });

  it('stays on for anything it does not recognise, including a typo', () => {
    expect(resolveShowCreativeWork('?showCreativeWork=false')).toBe(true);
    expect(resolveShowCreativeWork('?showCreativeWork=OFF')).toBe(true);
  });
});

describe('resolveShowUnverifiedIdentity', () => {
  it('defaults to isLive with no query string at all', () => {
    expect(resolveShowUnverifiedIdentity(true, undefined)).toBe(true);
    expect(resolveShowUnverifiedIdentity(false, undefined)).toBe(false);
    expect(resolveShowUnverifiedIdentity(true, '')).toBe(true);
    expect(resolveShowUnverifiedIdentity(false, '')).toBe(false);
  });

  it('defaults to isLive when the query string says nothing about it', () => {
    expect(resolveShowUnverifiedIdentity(true, '?window=300')).toBe(true);
    expect(resolveShowUnverifiedIdentity(false, '?window=300')).toBe(false);
  });

  it('is on for the exact value regardless of isLive', () => {
    expect(resolveShowUnverifiedIdentity(false, '?showUnverifiedIdentity=on')).toBe(true);
    expect(resolveShowUnverifiedIdentity(true, '?showUnverifiedIdentity=on')).toBe(true);
  });

  it('is off for the exact value regardless of isLive', () => {
    expect(resolveShowUnverifiedIdentity(true, '?showUnverifiedIdentity=off')).toBe(false);
    expect(resolveShowUnverifiedIdentity(false, '?showUnverifiedIdentity=off')).toBe(false);
  });

  it('falls back to isLive on anything it does not recognise, including a typo', () => {
    expect(resolveShowUnverifiedIdentity(true, '?showUnverifiedIdentity=On')).toBe(true);
    expect(resolveShowUnverifiedIdentity(false, '?showUnverifiedIdentity=On')).toBe(false);
  });
});
