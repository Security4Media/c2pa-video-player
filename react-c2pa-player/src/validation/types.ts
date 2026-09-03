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

import type {
  CawgTrustSettings,
  Manifest,
  ManifestStore,
  TrustSettings,
} from '@contentauth/c2pa-web';

export type PlayerValidationState = 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';

export type AdapterKind =
  | 'monolithic'
  | 'hls-fragmented-fmp4'
  | 'dash-fragmented-fmp4'
  | 'unsupported';

export type MediaSourceOrigin = 'server' | 'local' | 'remote' | 'blob' | 'unknown';

export interface MediaSourceDescriptor {
  url: string;
  displayName: string;
  mimeType: string | null;
  extension: string | null;
  origin: MediaSourceOrigin;
}

export interface AdapterCapabilities {
  ownsPlayback: boolean;
  providesTimelineSegments: boolean;
  supportsLookupByTime: boolean;
  /** Whether this adapter can validate an unbounded/live source, not just a fixed-length VOD asset. */
  supportsLive: boolean;
  /**
   * Whether this adapter's underlying validation library must attach
   * directly to (and drive) the video element itself to work at all -
   * distinct from `ownsPlayback`, which describes whether it currently
   * does so, not whether the format inherently requires it.
   */
  requiresPlayerOwnership: boolean;
}

export interface TrustMaterial {
  wasmSrc: string;
  trust: TrustSettings;
  // CawgTrustSettings rather than TrustSettings: it adds `verifyTrustList`,
  // which is what turns CAWG identity trust validation on and has an effect
  // only here.
  cawgTrust: CawgTrustSettings;
}

export interface TrustMaterialProvider {
  load(): Promise<TrustMaterial>;
}

export interface ValidationPolicy {
  enableTrustVerification: boolean;
  trustMaterialProvider: TrustMaterialProvider;
  /**
   * How much of a live stream to remember, in seconds. Governs the timeline
   * window, the retained validation history and the per-segment metadata
   * cache together, so they cannot disagree about what "recent" means.
   */
  liveRetentionSeconds: number;
  /**
   * Whether playback may show a live segment before its verdict exists.
   *
   * On by default: the DASH plugin validates after handing bytes to the
   * player, so without this the picture can run ahead of the checking. Turning
   * it off restores that, which is worth having as a switch because the gate
   * stops the picture when validation stops.
   */
  enforceValidatedPlayback: boolean;
  /**
   * Whether to state the provenance of the moment on screen, over the picture.
   *
   * Off by default. See policy/authenticity.ts for why this is separate from
   * the consent mode below.
   */
  showAuthenticityLabel: boolean;
  /**
   * Where the consent question is raised: once per source as it always has
   * been, or once per contiguous stretch of invalid content.
   */
  consentMode: ConsentMode;
}

/**
 * Where the consent question is raised, if anywhere.
 *
 * - `whole-asset` is the behaviour the player has always had: raised from
 *   video.js's `play` handler, and only when the source's own credentials are
 *   already known bad. On a fragmented source that never happens, because its
 *   verdict needs fragments, which need playback.
 * - `per-stream` raises it the first time invalid content is actually played,
 *   once, and never again for that source. Works on any source type.
 * - `per-run` raises it once per contiguous stretch of invalid content.
 *
 * The two new modes differ only in how long the "already asked" memory lasts:
 * the stretch, or the source.
 */
export type ConsentMode = 'whole-asset' | 'per-stream' | 'per-run';

/**
 * The part of the policy the player layer reads off the snapshot.
 *
 * One object rather than a field per setting, because a field per setting is
 * what went wrong: `enforceValidatedPlayback` was threaded into the DASH
 * session and its snapshot and silently left out of the other two, so `?gate=`
 * had no effect on HLS at all. Nothing here changes how a session validates;
 * these are decisions the player layer acts on, riding along because `main.ts`
 * holds a snapshot and not a policy.
 */
export interface CarriedSessionPolicy {
  enforceValidatedPlayback: boolean;
  showAuthenticityLabel: boolean;
  consentMode: ConsentMode;
}

/**
 * Status of one segment's cryptographic/structural check, as reported by a
 * fragmented-stream validator that may have no manifest to attach a status
 * to (e.g. a DASH segment covered only by continuity/replay checks).
 */
export type SegmentIntegrityStatus =
  | 'valid'
  | 'invalid'
  | 'replayed'
  | 'reordered'
  | 'missing'
  | 'warning'
  | 'unverified';

/**
 * Adapter-agnostic description of where a validation result's manifest data
 * (if any) came from. Lets menu/selector code branch on shape without each
 * adapter having to fabricate a `ManifestStore`-shaped compatibility object:
 * HLS and DASH leave `NormalizedValidationResult.manifestStore` null and let
 * menuViewModel.ts's manifestStore-less fallback path use `validationState`
 * directly; only monolithic populates a real `ManifestStore`, since its
 * reader genuinely produces one.
 */
export type ManifestSource =
  | { kind: 'manifest-store'; manifestStore: ManifestStore }
  | {
      kind: 'single-manifest';
      manifest: Manifest;
      manifests: Record<string, Manifest>;
      validationState: PlayerValidationState;
      validationErrors: unknown[];
    }
  | { kind: 'integrity-only'; integrityStatus: SegmentIntegrityStatus; sequenceReason?: string; errorCodes?: string[] }
  | { kind: 'none' };

export interface NormalizedValidationResult {
  manifestStore: ManifestStore | null;
  validationState: PlayerValidationState;
  activeManifest: Manifest | null;
  manifestSource?: ManifestSource;
}

export type NormalizedC2PAResult = NormalizedValidationResult;

export interface ValidationTimelineSegment {
  startTime: number;
  endTime: number;
  validationState: PlayerValidationState;
  pending?: boolean;
  /**
   * Validated, but playback has not reached it and it is still playable - so
   * "checked" is not yet the same claim as "checked and shown to a viewer".
   * The timeline renders these dimmed. Distinct from `pending`, which means no
   * verdict has arrived at all.
   *
   * Live only: on VOD an unread verdict is simply not shown (see
   * readRegionGate.ts), and nothing ever ages out of reach.
   */
  provisional?: boolean;
  /**
   * Settled without playback ever reaching it.
   *
   * The engine's verdict stands, but this player never showed the content to
   * anyone and it has since aged out of the DVR, so it can no longer be
   * confirmed by watching it. Worth saying out loud for an unverified segment,
   * which is otherwise a grey block on the bar with no explanation.
   *
   * Live only: on VOD an unread verdict is not shown at all (readRegionGate),
   * and nothing ever ages out of reach.
   */
  unplayed?: boolean;
  manifestRef?: ManifestSource;
}

export interface TimeInterval {
  startTime: number;
  endTime: number;
}

export interface ValidationStatusSnapshot {
  adapterKind: AdapterKind;
  result: NormalizedValidationResult | null;
  timelineSegments: ValidationTimelineSegment[];
  message: string;
  /**
   * The asset's own credentials failed validation, so no part of it is
   * trustworthy - as opposed to a specific region being bad. Distinct from
   * `timelineSegments` because it is knowable up front (from the manifest /
   * init segment) rather than accumulated as playback reads segments, and the
   * timeline renders it as a single whole-bar verdict instead of per-segment.
   *
   * Unsigned content is NOT this: no credentials to fail means Unknown, not
   * invalid.
   */
  wholeAssetInvalid?: boolean;
  /**
   * The source has no fixed end, so the timeline is a window onto the live
   * edge rather than the whole asset. `undefined` while still unknown.
   */
  isLive?: boolean;
  /**
   * The live retention in force, so the timeline sizes its window from the
   * same value the adapter prunes by rather than its own copy of the default.
   */
  liveRetentionSeconds?: number;
  /**
   * How far back the origin lets anyone seek (`timeShiftBufferDepth`), in
   * seconds. The timeline spans this, capped by the retention, so the bar
   * covers exactly what can be reached. `undefined` until the manifest says.
   */
  dvrWindowSeconds?: number;
  /**
   * Whether playback must not overtake validation. Carried here so the player
   * layer reads one snapshot rather than reaching into the policy.
   */
  enforceValidatedPlayback?: boolean;
  /** Whether to show the authenticity label. See CarriedSessionPolicy. */
  showAuthenticityLabel?: boolean;
  /** Where to raise the consent question. See CarriedSessionPolicy. */
  consentMode?: ConsentMode;
}

export type ValidationSessionListener = (snapshot: ValidationStatusSnapshot) => void;

export interface ValidationSession {
  readonly adapterKind: AdapterKind;
  load(): Promise<void>;
  dispose(): void;
  getStatusAt(time: number): ValidationStatusSnapshot;
  subscribe(listener: ValidationSessionListener): () => void;
}

export interface ValidationAdapterContext {
  videoElement: HTMLVideoElement;
  source: MediaSourceDescriptor;
  policy: ValidationPolicy;
}

export interface MediaValidationAdapter {
  readonly kind: AdapterKind;
  readonly capabilities: AdapterCapabilities;
  canHandle(source: MediaSourceDescriptor): boolean;
  createSession(context: ValidationAdapterContext): ValidationSession;
}
