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
import { DashSegmentMetadataReader } from './dashSegmentMetadata';

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

const reader = (
  pipeline: ReturnType<typeof stubPipeline>['pipeline'],
  maxPendingPerMediaType?: number,
) =>
  new DashSegmentMetadataReader(
    pipeline as unknown as ConstructorParameters<typeof DashSegmentMetadataReader>[0],
    maxPendingPerMediaType,
  );

describe('DashSegmentMetadataReader', () => {
  it('joins by arrival order, not by an identifier', async () => {
    const { pipeline } = stubPipeline((i) => manifest(`title-${i}`));
    const subject = reader(pipeline);

    await subject.read(new Uint8Array(), 'video');
    await subject.read(new Uint8Array(), 'video');

    expect(subject.takeNext('video')).toMatchObject({
      assertions: [{ data: { 'dc:title': 'title-0' } }],
    });
    expect(subject.takeNext('video')).toMatchObject({
      assertions: [{ data: { 'dc:title': 'title-1' } }],
    });
  });

  it('keeps separate media types from interleaving', async () => {
    const { pipeline } = stubPipeline((i) => manifest(`title-${i}`));
    const subject = reader(pipeline);

    await subject.read(new Uint8Array(), 'video');
    await subject.read(new Uint8Array(), 'audio');

    expect(subject.takeNext('video')).toMatchObject({
      assertions: [{ data: { 'dc:title': 'title-0' } }],
    });
    expect(subject.takeNext('audio')).toMatchObject({
      assertions: [{ data: { 'dc:title': 'title-1' } }],
    });
  });

  it('returns null once the queue for a media type is drained', async () => {
    const { pipeline } = stubPipeline(() => manifest('x'));
    const subject = reader(pipeline);

    expect(subject.takeNext('video')).toBeNull();

    await subject.read(new Uint8Array(), 'video');
    subject.takeNext('video');

    expect(subject.takeNext('video')).toBeNull();
  });

  it('queues a miss (not a skip) when a segment carries no manifest, keeping later draws aligned', async () => {
    const { pipeline } = stubPipeline((i) => (i === 0 ? null : manifest(`title-${i}`)));
    const subject = reader(pipeline);

    await subject.read(new Uint8Array(), 'video');
    await subject.read(new Uint8Array(), 'video');

    expect(subject.takeNext('video')).toBeNull();
    expect(subject.takeNext('video')).toMatchObject({
      assertions: [{ data: { 'dc:title': 'title-1' } }],
    });
  });

  it('queues a miss (not a skip) when the pipeline throws, since metadata must not break playback', async () => {
    let calls = 0;
    const failing = {
      controller: { on: () => undefined },
      async route() {
        calls += 1;
        if (calls === 1) {
          throw new Error('validator exploded');
        }
      },
    };
    const subject = reader(failing as unknown as ReturnType<typeof stubPipeline>['pipeline']);

    await expect(subject.read(new Uint8Array(), 'video')).resolves.toBeUndefined();
    await subject.read(new Uint8Array(), 'video');

    expect(subject.takeNext('video')).toBeNull();
    // The second read's manifest is still null here (the stub never sets one
    // on success), but it must be a second, distinct queue entry rather than
    // the first read's failure leaving nothing queued at all.
    expect(subject.takeNext('video')).toBeNull();
    expect(subject.takeNext('video')).toBeNull();
  });

  it('drops the oldest pending entry once a media type exceeds its bound, so a desync cannot grow unbounded', async () => {
    const { pipeline } = stubPipeline((i) => manifest(`title-${i}`));
    const subject = reader(pipeline, 10);

    // Read far more than the bound without ever draining, simulating the
    // primary pipeline having stalled or desynced.
    for (let i = 0; i < 15; i += 1) {
      await subject.read(new Uint8Array(), 'video');
    }

    expect(subject.takeNext('video')).toMatchObject({
      assertions: [{ data: { 'dc:title': 'title-5' } }],
    });
  });

  it('reads nothing more once disposed', async () => {
    const { pipeline, routed } = stubPipeline((i) => manifest(`title-${i}`));
    const subject = reader(pipeline);

    subject.dispose();
    await subject.read(new Uint8Array(), 'video');

    expect(routed).toHaveLength(0);
    expect(subject.takeNext('video')).toBeNull();
  });
});
