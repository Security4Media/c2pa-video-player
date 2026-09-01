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

/**
 * Per-segment CAWG identity and Dublin Core, read through the plugin.
 *
 * The plugin picks its validation path by whether the init segment supplied
 * session keys. Both of these streams' inits do, so it takes the VSI path,
 * where `SegmentRecord.manifest` is the *init's* manifest, written once in the
 * init handler and never from a media segment. Neither init carries a CAWG
 * assertion, so on that path the plugin reports no identity and no `dc:*` at
 * all, even though every media segment has both.
 *
 * Rather than parse segments here, this feeds a second pipeline. It is the
 * plugin's own player-agnostic entry point, and giving it only media segments
 * means it never loads session keys and so takes the ManifestBox path, where
 * the plugin parses each segment's own manifest for us.
 *
 * Its *verdict* is meaningless and must never be used: with no init it has no
 * session keys and no continuity chain, so it reports `invalid` with
 * livevideo.assertion.invalid, segment.invalid and continuityMethod.invalid on
 * a perfectly good segment. Only `manifest` is read from it. The verdict comes
 * from the primary pipeline, which has the init and the keys.
 */

import type { C2paManifest, MediaType } from '@qualabs/c2pa-live-dashjs-plugin';



interface MetadataPipeline {
  controller: {
    on(event: 'segmentValidated', listener: (record: { manifest?: C2paManifest | null }) => void): unknown;
    on(event: 'error', listener: (payload: unknown) => void): unknown;
  };
  route(input: {
    kind: 'media';
    mediaType: MediaType;
    bytes: Uint8Array;
    segmentIndex: number;
  }): Promise<void>;
}

export class DashSegmentMetadataReader {
  readonly #pipeline: MetadataPipeline;
  readonly #manifests = new Map<number, C2paManifest>();
  /** Set by the listener during the awaited route below, then consumed. */
  #lastManifest: C2paManifest | null = null;
  #disposed = false;
  /** Bounded to the same window the rest of the DASH stack retains. */
  readonly #maxRetainedSegments: number;

  constructor(pipeline: MetadataPipeline, maxRetainedSegments = 450) {
    this.#pipeline = pipeline;
    this.#maxRetainedSegments = maxRetainedSegments;
    this.#pipeline.controller.on('segmentValidated', (record) => {
      this.#lastManifest = record.manifest ?? null;
    });
    // Expected and uninteresting: this pipeline is deliberately starved of the
    // init segment, so it complains about continuity on every segment.
    this.#pipeline.controller.on('error', () => {});
  }

  /**
   * Reads one segment's manifest.
   *
   * `route` resolves only once the record has been emitted, so the manifest
   * captured during the await belongs to this segment and no other - no
   * correlation by identifier is needed, and no race with the next segment.
   */
  async read(segmentNumber: number, bytes: Uint8Array, mediaType: MediaType): Promise<void> {
    if (this.#disposed) {
      return;
    }

    this.#lastManifest = null;

    try {
      await this.#pipeline.route({ kind: 'media', mediaType, bytes, segmentIndex: segmentNumber });
    } catch {
      // Metadata is decoration; a failure here must never disturb playback or
      // the verdict, both of which come from elsewhere.
      return;
    }

    if (this.#lastManifest && !this.#disposed) {
      this.#manifests.set(segmentNumber, this.#lastManifest);
      this.#forgetOldest();
    }
  }

  get(segmentNumber: number): C2paManifest | null {
    return this.#manifests.get(segmentNumber) ?? null;
  }

  dispose(): void {
    this.#disposed = true;
    this.#manifests.clear();
  }

  /** Insertion order is arrival order, so the front is the oldest. */
  #forgetOldest(): void {
    while (this.#manifests.size > this.#maxRetainedSegments) {
      const oldest = this.#manifests.keys().next();

      if (oldest.done) {
        return;
      }

      this.#manifests.delete(oldest.value);
    }
  }
}

/**
 * The segment number in a DASH media URL, which both pipelines agree on.
 *
 * Observed on the live feed: the URL's `-465701125.m4s` matches the COSE
 * sequence number the primary pipeline reports as `segmentNumber`, so it joins
 * a segment's metadata to its verdict.
 */
export function segmentNumberFromUrl(url: string | undefined): number | null {
  const match = /-(\d+)\.[a-z0-9]+(?:\?|$)/i.exec(url ?? '');

  return match ? Number(match[1]) : null;
}
