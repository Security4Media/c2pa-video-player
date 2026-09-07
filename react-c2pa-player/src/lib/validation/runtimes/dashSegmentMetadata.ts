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
 *
 * The two pipelines are joined by arrival order, not by an identifier.
 * `dashBridgeRuntime.ts`'s interceptor is registered before `attachC2pa`
 * specifically so this reader's `read()` (and the enqueue it does when that
 * resolves) completes before the primary pipeline's `segmentValidated` fires
 * for the same response - both observe the same underlying segment downloads,
 * in the same order, so a FIFO pairing is reliable without needing two
 * independently-numbered sequences to agree. (An earlier version of this file
 * joined by a segment number parsed out of the request URL, on the assumption
 * that it matched the primary pipeline's COSE-signed VSI sequence number. That
 * assumption does not hold in general - a `$Time$`-templated DASH URL carries
 * a raw presentation timestamp, unrelated to the small, by-exactly-1
 * incrementing counter the VSI sequence number actually is - so it silently
 * failed to join on such a stream. This mirrors the FIFO already used for
 * fragment timing in `dashBridgeRuntime.ts`'s `#pendingTiming`, for the same
 * reason.)
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

/**
 * How many un-drained entries one media type's queue may hold before this
 * gives up on them.
 *
 * Not a history size: in steady state `takeNext` drains an entry within one
 * segment of it being queued (see the class doc comment), so this is a safety
 * net for the two event streams desyncing, not a cache. A queue this deep
 * means something is already wrong, and joining a stale entry to the wrong
 * segment's verdict would be worse than joining none.
 */
const DEFAULT_MAX_PENDING_PER_MEDIA_TYPE = 32;

export class DashSegmentMetadataReader {
  readonly #pipeline: MetadataPipeline;
  readonly #pending = new Map<MediaType, Array<C2paManifest | null>>();
  /** Set by the listener during the awaited route below, then consumed. */
  #lastManifest: C2paManifest | null = null;
  #disposed = false;
  /** The plugin's own bookkeeping index, unrelated to any join key. */
  #nextSegmentIndex = 0;
  readonly #maxPendingPerMediaType: number;

  constructor(pipeline: MetadataPipeline, maxPendingPerMediaType = DEFAULT_MAX_PENDING_PER_MEDIA_TYPE) {
    this.#pipeline = pipeline;
    this.#maxPendingPerMediaType = maxPendingPerMediaType;
    this.#pipeline.controller.on('segmentValidated', (record) => {
      this.#lastManifest = record.manifest ?? null;
    });
    // Expected and uninteresting: this pipeline is deliberately starved of the
    // init segment, so it complains about continuity on every segment.
    this.#pipeline.controller.on('error', () => {});
  }

  /**
   * Reads one segment's manifest and queues the result for `takeNext`.
   *
   * `route` resolves only once the record has been emitted, so the manifest
   * captured during the await belongs to this segment and no other - no
   * correlation by identifier is needed for *that* part, and no race with the
   * next segment. A queue entry is pushed unconditionally, including on
   * failure or when the segment carried no manifest: `takeNext` draws in the
   * same order `read` was called, so a call that pushed nothing would shift
   * every later entry out of alignment with the primary pipeline's verdicts.
   */
  async read(bytes: Uint8Array, mediaType: MediaType): Promise<void> {
    if (this.#disposed) {
      return;
    }

    this.#lastManifest = null;
    const segmentIndex = this.#nextSegmentIndex;
    this.#nextSegmentIndex += 1;

    try {
      await this.#pipeline.route({ kind: 'media', mediaType, bytes, segmentIndex });
    } catch {
      // Metadata is decoration; a failure here must never disturb playback or
      // the verdict, both of which come from elsewhere.
      if (!this.#disposed) {
        this.#enqueue(mediaType, null);
      }
      return;
    }

    if (!this.#disposed) {
      this.#enqueue(mediaType, this.#lastManifest);
    }
  }

  /**
   * The oldest still-queued manifest for `mediaType`, or `null` if the queue
   * is empty or that entry was itself a miss.
   */
  takeNext(mediaType: MediaType): C2paManifest | null {
    const queue = this.#pending.get(mediaType);

    return queue && queue.length > 0 ? (queue.shift() ?? null) : null;
  }

  dispose(): void {
    this.#disposed = true;
    this.#pending.clear();
  }

  #enqueue(mediaType: MediaType, manifest: C2paManifest | null): void {
    const queue = this.#pending.get(mediaType) ?? [];
    queue.push(manifest);

    if (queue.length > this.#maxPendingPerMediaType) {
      console.warn(
        `[DASH C2PA] Metadata queue for '${mediaType}' exceeded ${this.#maxPendingPerMediaType} ` +
          'pending entries - dropping the oldest. The metadata pipeline and the primary ' +
          'validation pipeline may have desynced.',
      );
      queue.shift();
    }

    this.#pending.set(mediaType, queue);
  }
}
