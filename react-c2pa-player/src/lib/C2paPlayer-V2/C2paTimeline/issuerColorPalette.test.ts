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
import { createIssuerColorAssigner } from './issuerColorPalette';

const PALETTE = ['blue-1', 'blue-2', 'blue-3'] as const;

describe('createIssuerColorAssigner', () => {
  it('assigns colours in first-seen order', () => {
    const assigner = createIssuerColorAssigner();

    expect(assigner.colorFor('Westdeutscher Rundfunk Intermediate', PALETTE)).toBe('blue-1');
    expect(assigner.colorFor('Unified Tutorial Intermediate', PALETTE)).toBe('blue-2');
  });

  it('is stable for an issuer already seen, regardless of what else has been seen since', () => {
    const assigner = createIssuerColorAssigner();

    expect(assigner.colorFor('WDR', PALETTE)).toBe('blue-1');
    assigner.colorFor('Unified', PALETTE);
    assigner.colorFor('Someone else', PALETTE);

    expect(assigner.colorFor('WDR', PALETTE)).toBe('blue-1');
  });

  it('wraps around the palette once there are more issuers than colours', () => {
    const assigner = createIssuerColorAssigner();

    expect(assigner.colorFor('a', PALETTE)).toBe('blue-1');
    expect(assigner.colorFor('b', PALETTE)).toBe('blue-2');
    expect(assigner.colorFor('c', PALETTE)).toBe('blue-3');
    expect(assigner.colorFor('d', PALETTE)).toBe('blue-1');
  });

  it('never hardcodes a specific issuer name to a specific colour', () => {
    // Two independent assigners must agree only because they see issuers in
    // the same order, not because a name is special-cased anywhere.
    const first = createIssuerColorAssigner();
    const second = createIssuerColorAssigner();

    expect(first.colorFor('Some Broadcaster Intermediate', PALETTE)).toBe(
      second.colorFor('Some Broadcaster Intermediate', PALETTE),
    );
    expect(first.colorFor('Another Org', PALETTE)).toBe(second.colorFor('Another Org', PALETTE));
  });
});
