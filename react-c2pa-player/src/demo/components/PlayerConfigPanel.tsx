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
  resolveIcaTrustFixtureName,
  resolveIdentityTrustMode,
  resolveLiveRetentionSeconds,
  resolveMonolithicEngine,
  resolveShowAuthenticityLabel,
  resolveShowCreativeWork,
  resolveTrustFixtureName,
  type ConsentMode,
  type IcaTrustFixtureName,
  type IdentityTrustMode,
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

const ICA_TRUST_PROFILES: { value: IcaTrustFixtureName | 'full-prod'; label: string }[] = [
  { value: 'full-prod', label: 'full-prod (default)' },
  { value: 'full-dev', label: 'full-dev' },
  { value: 'empty', label: 'empty' },
  { value: 'wrong-issuer', label: 'wrong-issuer' },
];

// The shipped defaults for every switch below, i.e. what a deployment gets
// with no query string at all. Used only to compute the "changed from
// default" count and to drive "Reset to defaults" - not read anywhere else,
// so keeping this list in sync with the README's "Runtime parameters" table
// is only load-bearing for those two things.
const DEFAULT_LABEL = false;
const DEFAULT_IDENTITY_TRUST_RELAXED = true;
const DEFAULT_SHOW_CREATIVE_WORK = true;
const DEFAULT_CONSENT: ConsentMode = 'whole-asset';
const DEFAULT_TRUST: TrustFixtureName | 'full-prod' = 'full-prod';
const DEFAULT_ICA_TRUST: IcaTrustFixtureName | 'full-prod' = 'full-prod';
const DEFAULT_ENGINE: MonolithicEngine = 'nettrek';
const DEFAULT_GATE_ENABLED = true;
const DEFAULT_ISSUER_COLORS = false;

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
  const [icaTrust, setIcaTrust] = useState<IcaTrustFixtureName | 'full-prod'>(
    () => resolveIcaTrustFixtureName() ?? 'full-prod'
  );
  const [windowSeconds, setWindowSeconds] = useState<number>(() => resolveLiveRetentionSeconds());
  const [gateEnabled, setGateEnabled] = useState<boolean>(() => resolveEnforceValidatedPlayback());
  const [engine, setEngine] = useState<MonolithicEngine>(() => resolveMonolithicEngine());
  const [identityTrustRelaxed, setIdentityTrustRelaxed] = useState<boolean>(
    () => resolveIdentityTrustMode() === 'relaxed'
  );
  const [showCreativeWork, setShowCreativeWork] = useState<boolean>(() => resolveShowCreativeWork());
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

  const handleIcaTrustChange = useCallback(
    (value: IcaTrustFixtureName | 'full-prod') => {
      setIcaTrust(value);
      applyParam('icaTrust', value === 'full-prod' ? null : value);
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

  const handleIdentityTrustChange = useCallback(
    (checked: boolean) => {
      setIdentityTrustRelaxed(checked);
      const mode: IdentityTrustMode = checked ? 'relaxed' : 'strict';
      applyParam('identityTrust', mode === 'strict' ? 'strict' : null);
      onApply();
    },
    [onApply]
  );

  const handleShowCreativeWorkChange = useCallback(
    (checked: boolean) => {
      setShowCreativeWork(checked);
      applyParam('showCreativeWork', checked ? null : 'off');
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

  // Resets every switch to the shipped default in one go: all ten local
  // states, all ten URL params, one single onApply() (not ten) so the
  // current video reloads once rather than repeatedly.
  const handleResetAll = useCallback(() => {
    setLabel(DEFAULT_LABEL);
    setIdentityTrustRelaxed(DEFAULT_IDENTITY_TRUST_RELAXED);
    setShowCreativeWork(DEFAULT_SHOW_CREATIVE_WORK);
    setConsent(DEFAULT_CONSENT);
    setTrust(DEFAULT_TRUST);
    setIcaTrust(DEFAULT_ICA_TRUST);
    setEngine(DEFAULT_ENGINE);
    setWindowSeconds(DEFAULT_LIVE_RETENTION_SECONDS);
    setGateEnabled(DEFAULT_GATE_ENABLED);
    setIssuerColors(DEFAULT_ISSUER_COLORS);

    applyParam('label', null);
    applyParam('identityTrust', null);
    applyParam('showCreativeWork', null);
    applyParam('consent', null);
    applyParam('trust', null);
    applyParam('icaTrust', null);
    applyParam('monolithicEngine', null);
    applyParam('window', null);
    applyParam('gate', null);
    applyParam('issuerColors', null);

    onApply();
  }, [onApply]);

  const changedCount = useMemo(() => {
    let count = 0;
    if (label !== DEFAULT_LABEL) count += 1;
    if (identityTrustRelaxed !== DEFAULT_IDENTITY_TRUST_RELAXED) count += 1;
    if (showCreativeWork !== DEFAULT_SHOW_CREATIVE_WORK) count += 1;
    if (consent !== DEFAULT_CONSENT) count += 1;
    if (trust !== DEFAULT_TRUST) count += 1;
    if (icaTrust !== DEFAULT_ICA_TRUST) count += 1;
    if (engine !== DEFAULT_ENGINE) count += 1;
    if (windowSeconds !== DEFAULT_LIVE_RETENTION_SECONDS) count += 1;
    if (gateEnabled !== DEFAULT_GATE_ENABLED) count += 1;
    if (issuerColors !== DEFAULT_ISSUER_COLORS) count += 1;
    return count;
  }, [
    label,
    identityTrustRelaxed,
    showCreativeWork,
    consent,
    trust,
    icaTrust,
    engine,
    windowSeconds,
    gateEnabled,
    issuerColors,
  ]);

  return (
    <div className="player-config-panel">
      <div className="player-config-panel__header">
        <div>
          <h3>Player Config</h3>
          <p className="player-config-panel__hint">
            Each control mirrors a query-string switch from the README&apos;s &quot;Runtime
            parameters&quot; table. Hover a control for the full detail. Changing one reloads the
            current video.
          </p>
        </div>
        {changedCount > 0 && (
          <div className="player-config-panel__status">
            <span>
              {changedCount} {changedCount === 1 ? 'setting' : 'settings'} changed from default
            </span>
            <button type="button" onClick={handleResetAll}>
              Reset to defaults
            </button>
          </div>
        )}
      </div>

      <div className="player-config-section">
        <h4 className="player-config-section__heading">Display</h4>
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
            <span className="player-config-control__text">
              <span className="player-config-control__label">Authenticity label</span>
              <span className="player-config-control__hint">
                Shows a provenance badge over the picture.
              </span>
            </span>
          </label>

          <label
            className="player-config-control player-config-control--checkbox"
            title="Shows organization/publisher, copyright, AI opt-out, and Creator information for an identity that is only Valid (structurally verified but not on this player's trusted-anchor list), not just Trusted. On by default. Unchecking sets ?identityTrust=strict, which also tightens Creator to Trusted-only. (?identityTrust=strict when unchecked)"
          >
            <input
              type="checkbox"
              checked={identityTrustRelaxed}
              onChange={(event) => handleIdentityTrustChange(event.target.checked)}
            />
            <span className="player-config-control__text">
              <span className="player-config-control__label">
                Show info for Valid (not just Trusted) identities
              </span>
              <span className="player-config-control__hint">
                Also shows identity details for structurally valid, not just trusted, signers.
              </span>
            </span>
          </label>

          <label
            className="player-config-control player-config-control--checkbox"
            title="Shows information derived from the stds.schema-org.CreativeWork assertion: Organization Details, About the Producer (authors/organization name), and Organization Identity's Published-on/License lines. On by default. Does not affect Copyright, which is cawg.metadata-derived. (?showCreativeWork=off when unchecked)"
          >
            <input
              type="checkbox"
              checked={showCreativeWork}
              onChange={(event) => handleShowCreativeWorkChange(event.target.checked)}
            />
            <span className="player-config-control__text">
              <span className="player-config-control__label">Show CreativeWork information</span>
              <span className="player-config-control__hint">
                Shows organization, producer and license details from the asset.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="player-config-section player-config-section--elevated">
        <h4 className="player-config-section__heading">Trust &amp; validation</h4>
        <p className="player-config-section__note">
          These change what counts as a valid or trusted signer, not just what&apos;s shown.
        </p>
        <div className="player-config-grid">
          <label
            className="player-config-control"
            title="Where the consent question is raised: once per source, only if already known bad (whole-asset, default); the first time invalid content plays (per-stream); or once per contiguous invalid stretch (per-run). (?consent=)"
          >
            <span className="player-config-control__label">Consent mode</span>
            <span className="player-config-control__hint">
              When to ask before playing unverified content.
            </span>
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
            <span className="player-config-control__label">Trust profile</span>
            <span className="player-config-control__hint">Which certificates count as trusted.</span>
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
            title="Which DIDs this player trusts as issuers of CAWG Identity Claims Aggregation (ICA) credentials - a separate, app-level trust list, since the C2PA engine has no DID trust-anchor concept of its own. Unrecognised values fall back to full-prod. (?icaTrust=)"
          >
            <span className="player-config-control__label">ICA issuer trust profile</span>
            <span className="player-config-control__hint">
              Which issuers this player trusts for identity credentials.
            </span>
            <select
              value={icaTrust}
              onChange={(event) =>
                handleIcaTrustChange(event.target.value as IcaTrustFixtureName | 'full-prod')
              }
            >
              {ICA_TRUST_PROFILES.map((profile) => (
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
            <span className="player-config-control__label">Monolithic engine</span>
            <span className="player-config-control__hint">Which engine validates MP4 files.</span>
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
      </div>

      <fieldset className="player-config-subsection" disabled={!isLiveCapableFormat}>
        <legend title="These only take effect on a live HLS/DASH source. Enabled here by format, not by confirmed liveness: whether a loaded HLS/DASH file actually is live is only known once its manifest is parsed.">
          Live-only settings
        </legend>
        {!isLiveCapableFormat && (
          <p className="player-config-subsection__note">
            Load a live HLS or DASH stream to use these.
          </p>
        )}
        <div className="player-config-grid">
          <label
            className="player-config-control"
            title={`How much of a live stream the player remembers: the timeline window, retained validation history, and failure log retention, in seconds. Values under ${MIN_LIVE_WINDOW_SECONDS} are ignored. Only applies to a live HLS/DASH source. (?window=)`}
          >
            <span className="player-config-control__label">Live retention window (s)</span>
            <span className="player-config-control__hint">
              How much of the live stream the player remembers.
            </span>
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
            <span className="player-config-control__text">
              <span className="player-config-control__label">Validated-playback gate</span>
              <span className="player-config-control__hint">
                Holds the picture until a live segment&apos;s verdict arrives.
              </span>
            </span>
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
            <span className="player-config-control__text">
              <span className="player-config-control__label">Colorize by issuer</span>
              <span className="player-config-control__hint">
                Paints each valid segment by which issuer signed it.
              </span>
            </span>
          </label>
        </div>
      </fieldset>
    </div>
  );
}
