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

import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_LIVE_RETENTION_SECONDS,
  MIN_LIVE_WINDOW_SECONDS,
  detectAdapterKind,
  resolveColorizeTimelineByIssuer,
  resolveConsentMode,
  resolveEnforceValidatedPlayback,
  resolveLiveRetentionSeconds,
  resolveMonolithicEngine,
  resolveShowAuthenticityLabel,
  resolveTrustFixtureName,
  type ConsentMode,
  type MediaSourceDescriptor,
  type MonolithicEngine,
  type TrustFixtureName,
} from '@/lib/validation';
import './PlayerConfigPanel.css';

interface PlayerConfigPanelProps {
  mediaSource: MediaSourceDescriptor | null;
  /** Called after the URL has been updated, so the host can reload the player. */
  onApply: () => void;
}

/**
 * Adds or removes one query parameter without touching the others, and
 * without adding a browser-history entry - these are config toggles, not
 * navigation.
 */
function applyParam(key: string, value: string | null): void {
  const url = new URL(window.location.href);

  if (value === null) {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }

  window.history.replaceState({}, document.title, url.toString());
}

const TRUST_PROFILES: { value: TrustFixtureName | 'full-prod'; label: string }[] = [
  { value: 'full-prod', label: 'full-prod (default)' },
  { value: 'full-dev', label: 'full-dev' },
  { value: 'anchors-only', label: 'anchors-only' },
  { value: 'cawg-missing', label: 'cawg-missing' },
  { value: 'empty', label: 'empty' },
  { value: 'wrong-anchor', label: 'wrong-anchor' },
];

/**
 * Visual controls for the query-string switches documented in the top-level
 * README's "Runtime parameters" table. Previously URL-only - see that table
 * for the full explanation each tooltip below is adapted from.
 *
 * Changing a control updates the URL (so the setting stays shareable /
 * bookmarkable) and calls `onApply`, which the host uses to reload the
 * currently loaded video so the new policy takes effect immediately.
 */
export function PlayerConfigPanel({ mediaSource, onApply }: PlayerConfigPanelProps) {
  const [label, setLabel] = useState<boolean>(() => resolveShowAuthenticityLabel());
  const [consent, setConsent] = useState<ConsentMode>(() => resolveConsentMode());
  const [trust, setTrust] = useState<TrustFixtureName | 'full-prod'>(
    () => resolveTrustFixtureName() ?? 'full-prod'
  );
  const [windowSeconds, setWindowSeconds] = useState<number>(() => resolveLiveRetentionSeconds());
  const [gateEnabled, setGateEnabled] = useState<boolean>(() => resolveEnforceValidatedPlayback());
  const [engine, setEngine] = useState<MonolithicEngine>(() => resolveMonolithicEngine());
  const [issuerColors, setIssuerColors] = useState<boolean>(() => resolveColorizeTimelineByIssuer());

  const adapterKind = useMemo(
    () => (mediaSource ? detectAdapterKind(mediaSource) : null),
    [mediaSource]
  );
  // Window/gate only ever have an effect on a live source - and whether a
  // loaded HLS/DASH source turns out to actually be live is only known after
  // its manifest is parsed, deep inside the player. Approximated here by
  // format instead: enabled for a format that CAN be live, disabled for a
  // plain MP4 (which never is) or when nothing is loaded yet.
  const isLiveCapableFormat =
    adapterKind === 'hls-fragmented-fmp4' || adapterKind === 'dash-fragmented-fmp4';
  // The engine choice only matters for monolithic MP4 - HLS/DASH keep their
  // own runtimes regardless of this setting.
  const isMonolithicFormat = adapterKind === 'monolithic';

  const handleLabelChange = useCallback(
    (checked: boolean) => {
      setLabel(checked);
      applyParam('label', checked ? 'on' : null);
      onApply();
    },
    [onApply]
  );

  const handleConsentChange = useCallback(
    (value: ConsentMode) => {
      setConsent(value);
      applyParam('consent', value === 'whole-asset' ? null : value);
      onApply();
    },
    [onApply]
  );

  const handleTrustChange = useCallback(
    (value: TrustFixtureName | 'full-prod') => {
      setTrust(value);
      applyParam('trust', value === 'full-prod' ? null : value);
      onApply();
    },
    [onApply]
  );

  const handleWindowChange = useCallback(
    (value: number) => {
      setWindowSeconds(value);
      applyParam(
        'window',
        Number.isFinite(value) && value !== DEFAULT_LIVE_RETENTION_SECONDS ? String(value) : null
      );
      onApply();
    },
    [onApply]
  );

  const handleGateChange = useCallback(
    (checked: boolean) => {
      setGateEnabled(checked);
      applyParam('gate', checked ? null : 'off');
      onApply();
    },
    [onApply]
  );

  const handleEngineChange = useCallback(
    (value: MonolithicEngine) => {
      setEngine(value);
      applyParam('monolithicEngine', value === 'c2pa-web' ? value : null);
      onApply();
    },
    [onApply]
  );

  const handleIssuerColorsChange = useCallback(
    (checked: boolean) => {
      setIssuerColors(checked);
      applyParam('issuerColors', checked ? 'on' : null);
      onApply();
    },
    [onApply]
  );

  return (
    <div className="player-config-panel">
      <h3>Player Config</h3>
      <p className="player-config-panel__hint">
        Diagnostic switches from the README&apos;s &quot;Runtime parameters&quot; table. Hover a
        control for details. Changing one reloads the current video.
      </p>
      <div className="player-config-grid">
        <label
          className="player-config-control player-config-control--checkbox"
          title="Shows the authenticity label in the top-right of the picture, stating the provenance of the moment on screen. Off by default. (?label=on)"
        >
          <input
            type="checkbox"
            checked={label}
            onChange={(event) => handleLabelChange(event.target.checked)}
          />
          Authenticity label
        </label>

        <label
          className="player-config-control"
          title="Where the consent question is raised: once per source, only if already known bad (whole-asset, default); the first time invalid content plays (per-stream); or once per contiguous invalid stretch (per-run). (?consent=)"
        >
          Consent mode
          <select
            value={consent}
            onChange={(event) => handleConsentChange(event.target.value as ConsentMode)}
          >
            <option value="whole-asset">whole-asset (default)</option>
            <option value="per-stream">per-stream</option>
            <option value="per-run">per-run</option>
          </select>
        </label>

        <label
          className="player-config-control"
          title="Swaps the trust material for one of these profiles, so trusted / valid / untrusted outcomes can be shown on the same file. Unrecognised values fall back to full-prod. (?trust=)"
        >
          Trust profile
          <select
            value={trust}
            onChange={(event) =>
              handleTrustChange(event.target.value as TrustFixtureName | 'full-prod')
            }
          >
            {TRUST_PROFILES.map((profile) => (
              <option key={profile.value} value={profile.value}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>

        <label
          className="player-config-control"
          title="Which runtime validates a monolithic MP4 file. 'nettrek' (default) is the shipped bridge-based runtime, also used for HLS. 'c2pa-web' is an independent runtime that calls @contentauth/c2pa-web directly. Only applies to a monolithic (MP4) source. (?monolithicEngine=)"
        >
          Monolithic engine
          <select
            value={engine}
            disabled={!isMonolithicFormat}
            onChange={(event) => handleEngineChange(event.target.value as MonolithicEngine)}
          >
            <option value="nettrek">nettrek (default)</option>
            <option value="c2pa-web">c2pa-web (standalone)</option>
          </select>
        </label>
      </div>

      <fieldset className="player-config-subsection" disabled={!isLiveCapableFormat}>
        <legend title="These only take effect on a live HLS/DASH source. Enabled here by format, not by confirmed liveness: whether a loaded HLS/DASH file actually is live is only known once its manifest is parsed.">
          Live-only settings
        </legend>
        <div className="player-config-grid">
          <label
            className="player-config-control"
            title={`How much of a live stream the player remembers: the timeline window, retained validation history, and failure log retention, in seconds. Values under ${MIN_LIVE_WINDOW_SECONDS} are ignored. Only applies to a live HLS/DASH source. (?window=)`}
          >
            Live retention window (s)
            <input
              type="number"
              min={MIN_LIVE_WINDOW_SECONDS}
              value={windowSeconds}
              disabled={!isLiveCapableFormat}
              onChange={(event) => handleWindowChange(Number(event.target.value))}
            />
          </label>

          <label
            className="player-config-control player-config-control--checkbox"
            title="Holds the picture rather than show live content whose verdict hasn't arrived yet. On by default; unchecking is an escape hatch if validation stalls. Only applies to a live HLS/DASH source. (?gate=off when unchecked)"
          >
            <input
              type="checkbox"
              checked={gateEnabled}
              disabled={!isLiveCapableFormat}
              onChange={(event) => handleGateChange(event.target.checked)}
            />
            Validated-playback gate
          </label>

          <label
            className="player-config-control player-config-control--checkbox"
            title="Paints each valid segment by which issuer signed it, instead of the shared Valid/Trusted colour - so a stream that rotates between signers is easy to tell apart at a glance. Issuers get a colour in the order they're first seen this session. Invalid stays red and unknown provenance stays grey either way. Off by default. Only applies to a live HLS/DASH source. (?issuerColors=on)"
          >
            <input
              type="checkbox"
              checked={issuerColors}
              disabled={!isLiveCapableFormat}
              onChange={(event) => handleIssuerColorsChange(event.target.checked)}
            />
            Colorize by issuer
          </label>
        </div>
      </fieldset>
    </div>
  );
}
