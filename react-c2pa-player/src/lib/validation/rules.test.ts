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
import { meetsIdentityTrustThreshold } from './rules';

describe('meetsIdentityTrustThreshold', () => {
  describe('strict', () => {
    it('requires exactly Trusted, allowUnknown or not', () => {
      expect(meetsIdentityTrustThreshold('Trusted', 'strict')).toBe(true);
      expect(meetsIdentityTrustThreshold('Valid', 'strict')).toBe(false);
      expect(meetsIdentityTrustThreshold('Unknown', 'strict')).toBe(false);
      expect(meetsIdentityTrustThreshold('Invalid', 'strict')).toBe(false);

      expect(meetsIdentityTrustThreshold('Trusted', 'strict', true)).toBe(true);
      expect(meetsIdentityTrustThreshold('Valid', 'strict', true)).toBe(false);
      expect(meetsIdentityTrustThreshold('Unknown', 'strict', true)).toBe(false);
      expect(meetsIdentityTrustThreshold('Invalid', 'strict', true)).toBe(false);
    });
  });

  describe('relaxed, allowUnknown false (Organization/Publisher, Copyright, AI opt-out)', () => {
    it('accepts Trusted or Valid, not Unknown or Invalid', () => {
      expect(meetsIdentityTrustThreshold('Trusted', 'relaxed')).toBe(true);
      expect(meetsIdentityTrustThreshold('Valid', 'relaxed')).toBe(true);
      expect(meetsIdentityTrustThreshold('Unknown', 'relaxed')).toBe(false);
      expect(meetsIdentityTrustThreshold('Invalid', 'relaxed')).toBe(false);
    });
  });

  describe('relaxed, allowUnknown true (Creator\'s own more permissive policy)', () => {
    it('accepts anything short of Invalid', () => {
      expect(meetsIdentityTrustThreshold('Trusted', 'relaxed', true)).toBe(true);
      expect(meetsIdentityTrustThreshold('Valid', 'relaxed', true)).toBe(true);
      expect(meetsIdentityTrustThreshold('Unknown', 'relaxed', true)).toBe(true);
      expect(meetsIdentityTrustThreshold('Invalid', 'relaxed', true)).toBe(false);
    });
  });
});
