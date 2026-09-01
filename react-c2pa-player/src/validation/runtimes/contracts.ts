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
 * What a session needs from the thing driving validation.
 *
 * Sessions hold the behaviour worth testing (what playback has read, which
 * failures condemn the asset, what the snapshot says), while runtimes hold the
 * parts that need a browser: hls.js, dash.js, a WASM or WebCrypto engine.
 * Depending on these interfaces instead of the concrete runtimes keeps that
 * behaviour reachable from a plain node test, with a stub standing in for the
 * engine.
 *
 * Vendor types below are imported as types only, so nothing here pulls a
 * player or an engine into the module graph at runtime.
 */

import type { ManifestStore } from '@contentauth/c2pa-web';
import type { C2paManifestHelper } from '@nettrek/c2pa-hls-bridge';
import type { NormalizedValidationResult } from '../types';
import type { DashSegmentEntry } from './dashBridgeRuntime';
import type { FragmentVerdict } from './hlsBridgeRuntime';

/** Notified whenever the runtime has new validation state to report. */
export type RuntimeChangeListener = () => void;

interface ValidationRuntime {
  load(): Promise<void>;
  dispose(): void;
  subscribe(listener: RuntimeChangeListener): () => void;
  getMessage(): string;
}

export interface HlsValidationRuntime extends ValidationRuntime {
  /** `null` while the playlist type is still unknown. */
  isLive(): boolean | null;
  /** The reader covering `time`, or `null` where nothing is validated yet. */
  lookup(time: number): C2paManifestHelper | null;
  /** Every fragment the bridge has validated, ahead of the playhead included. */
  getFragmentVerdicts(): FragmentVerdict[];
  getErrorReason(): string | null;
}

export interface MonolithicValidationRuntime extends ValidationRuntime {
  getManifestStore(): ManifestStore | null;
}

export interface DashValidationRuntime extends ValidationRuntime {
  /** `null` until the manifest reveals whether the stream is dynamic. */
  isLive(): boolean | null;
  /** The init segment's own C2PA processing failed, condemning the asset. */
  isInitInvalid(): boolean;
  lookup(time: number): { result: NormalizedValidationResult } | null;
  /**
   * Segments added since a total-ever count, which is how the session drains
   * without re-reading history the runtime may already have evicted.
   */
  getSegmentsSince(count: number): DashSegmentEntry[];
  getSegmentCount(): number;
  getErrorReason(): string | null;
}
