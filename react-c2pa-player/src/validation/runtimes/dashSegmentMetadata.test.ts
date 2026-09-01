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
import { DashSegmentMetadataReader, segmentNumberFromUrl } from './dashSegmentMetadata';

type Listener = (record: { manifest?: unknown }) => void;

/**
 * The plugin's pipeline, reduced to the two things the reader uses. `route`
 * emits before resolving, exactly as the real ManifestBox path does, which is
 * what makes the manifest captured during the await belong to that segment.
 */
function stubPipeline(manifestFor: (segmentIndex: number) => unknown) {
  const listeners: Listener[] = [];
  const routed: number[] = [];

  return {
    routed,
    pipeline: {
      controller: {
        on(event: string, listener: Listener) {
          if (event === 'segmentValidated') listeners.push(listener);
          return undefined;
        },
      },
      async route(input: { segmentIndex: number }) {
        routed.push(input.segmentIndex);
        const manifest = manifestFor(input.segmentIndex);
        for (const listener of listeners) listener({ manifest });
      },
    },
  };
}

const manifest = (title: string) => ({
  label: 'urn:c2pa:test',
  assertions: [{ label: 'cawg.metadata', data: { 'dc:title': title } }],
});

const reader = (pipeline: ReturnType<typeof stubPipeline>['pipeline']) =>
  new DashSegmentMetadataReader(
    pipeline as unknown as ConstructorParameters<typeof DashSegmentMetadataReader>[0],
  );

describe('segmentNumberFromUrl', () => {
  it('reads the number both pipelines agree on', () => {
    expect(segmentNumberFromUrl('https://x/dash/channel1-video=1200000-465701125.m4s')).toBe(465701125);
  });

  it('copes with a query string', () => {
    expect(segmentNumberFromUrl('https://x/seg-42.m4s?token=abc')).toBe(42);
  });

  it('returns null for anything that is not a numbered segment', () => {
    expect(segmentNumberFromUrl('https://x/channel1-video=1200000.dash')).toBeNull();
    expect(segmentNumberFromUrl('https://x/manifest.mpd')).toBeNull();
    expect(segmentNumberFromUrl(undefined)).toBeNull();
  });
});

describe('DashSegmentMetadataReader', () => {
  it('keeps each segment\'s own manifest, not the last one seen', async () => {
    const { pipeline } = stubPipeline((i) => manifest(`title-${i}`));
    const subject = reader(pipeline);

    await subject.read(1, new Uint8Array(), 'video');
    await subject.read(2, new Uint8Array(), 'video');

    expect(subject.get(1)).toMatchObject({ assertions: [{ data: { 'dc:title': 'title-1' } }] });
    expect(subject.get(2)).toMatchObject({ assertions: [{ data: { 'dc:title': 'title-2' } }] });
  });

  it('returns null for a segment it has not read', async () => {
    const { pipeline } = stubPipeline(() => manifest('x'));
    const subject = reader(pipeline);

    expect(subject.get(99)).toBeNull();
  });

  it('records nothing when the segment carries no manifest', async () => {
    const { pipeline } = stubPipeline(() => null);
    const subject = reader(pipeline);

    await subject.read(1, new Uint8Array(), 'video');

    expect(subject.get(1)).toBeNull();
  });

  it('survives a pipeline that throws, since metadata must not break playback', async () => {
    const failing = {
      controller: { on: () => undefined },
      async route() {
        throw new Error('validator exploded');
      },
    };
    const subject = reader(failing as unknown as ReturnType<typeof stubPipeline>['pipeline']);

    await expect(subject.read(1, new Uint8Array(), 'video')).resolves.toBeUndefined();
    expect(subject.get(1)).toBeNull();
  });

  it('forgets the oldest once the cache is full, so a long stream stays bounded', async () => {
    const { pipeline } = stubPipeline((i) => manifest(`title-${i}`));
    const subject = reader(pipeline);

    for (let i = 0; i < 320; i += 1) {
      await subject.read(i, new Uint8Array(), 'video');
    }

    expect(subject.get(0)).toBeNull();
    expect(subject.get(319)).not.toBeNull();
  });

  it('reads nothing more once disposed', async () => {
    const { pipeline, routed } = stubPipeline((i) => manifest(`title-${i}`));
    const subject = reader(pipeline);

    subject.dispose();
    await subject.read(1, new Uint8Array(), 'video');

    expect(routed).toHaveLength(0);
    expect(subject.get(1)).toBeNull();
  });
});
