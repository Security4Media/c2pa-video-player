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
import type { Manifest } from '@contentauth/c2pa-web';
import { hasPublishedAction, selectActionsAssertion } from './actionsSelectors';

// Real shape, captured via c2patool against test-5.mp4's active (WDR) manifest.
const manifestWithActions = (actions: Array<{ action: string }>, label = 'c2pa.actions.v2') =>
  ({
    assertions: [
      {
        label,
        data: {
          actions,
          allActionsIncluded: true,
        },
      },
    ],
  }) as unknown as Manifest;

describe('selectActionsAssertion', () => {
  it('finds the v2-labeled assertion', () => {
    const manifest = manifestWithActions([{ action: 'c2pa.opened' }]);

    expect(selectActionsAssertion(manifest)?.label).toBe('c2pa.actions.v2');
  });

  it('finds an unversioned c2pa.actions label too, by prefix', () => {
    const manifest = manifestWithActions([{ action: 'c2pa.opened' }], 'c2pa.actions');

    expect(selectActionsAssertion(manifest)?.label).toBe('c2pa.actions');
  });

  it('is null when no actions assertion exists', () => {
    const manifest = { assertions: [] } as unknown as Manifest;

    expect(selectActionsAssertion(manifest)).toBeNull();
  });
});

describe('hasPublishedAction', () => {
  it('is true when c2pa.published is among the declared actions', () => {
    // Reproduces adobe-27.1.mp4's action list.
    const manifest = manifestWithActions([
      { action: 'c2pa.opened' },
      { action: 'c2pa.published' },
    ]);

    expect(hasPublishedAction(manifest)).toBe(true);
  });

  it('is false when only other actions are declared', () => {
    // Reproduces test-5.mp4's active manifest: only c2pa.opened, no publish action.
    const manifest = manifestWithActions([{ action: 'c2pa.opened' }]);

    expect(hasPublishedAction(manifest)).toBe(false);
  });

  it('is false when there is no actions assertion at all', () => {
    const manifest = { assertions: [] } as unknown as Manifest;

    expect(hasPublishedAction(manifest)).toBe(false);
  });
});
