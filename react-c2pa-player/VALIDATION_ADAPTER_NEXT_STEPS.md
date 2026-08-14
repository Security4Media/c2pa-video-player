# Validation Adapter Refactor Continuity

## Current State

Branch: `feat/hls-validation`

Completed checkpoints:

1. `8d914dd` - Added validation adapter contracts, source detection, registry, and unsupported adapter.
2. `4463c89` - Wrapped current monolithic C2PA validation in `MonolithicC2PAAdapter`.
3. `9671d8e` - Routed adapter snapshots through the player status/timeline/menu surface.
4. `9727ef5` - Added HLS fragmented fMP4 validation with `@nettrek/c2pa-hls-bridge` and `hls.js`.
5. `d4a746c` - Patched HLS trust verification to use local player trust assets instead of `contentcredentials.org`.
6. Uncommitted WIP - Switched HLS integration to the fixed `fix/config-trust-wasm-version` bridge build via a repo-local vendored package under `vendor/c2pa-hls-bridge-fix`, removed the bridge monkey-patch, and wired trust/WASM through the bridge config directly.
7. Uncommitted WIP - Added a `dash-fragmented-fmp4` adapter for **live** DASH using `@qualabs/c2pa-live-dashjs-plugin` + `dashjs` (see "DASH Adapter Phase — Live, Implemented" below for what shipped and what's still unverified).

The working tree should be clean except the untracked root `.codex` directory. Do not include `.codex` in commits.

## Important Findings

- The fixed bridge branch at `ARD-C2PA-SAMPLES/C2PA-hls.js-validation/tree/fix/config-trust-wasm-version` exposes `trust`, `cawgTrust`, and `wasmSrc` in `C2PAConfig`, which lets the player pass local trust assets and an explicit WASM URL without monkey-patching bridge internals.
- The GitHub branch is not directly consumable through an npm Git dependency in its current form because the installed payload only contains source files while `exports` point to `dist/*`. The current WIP vendors a built snapshot into `vendor/c2pa-hls-bridge-fix` and references it with `file:../vendor/c2pa-hls-bridge-fix`.
- Vite dependency optimization can still interfere with bridge asset resolution, so `optimizeDeps.exclude = ['@nettrek/c2pa-hls-bridge']` remains part of the stabilization plan.

Recommended Vite workaround to test next:

```ts
optimizeDeps: {
  exclude: ['@nettrek/c2pa-hls-bridge'],
},
```

Then clear the Vite cache before restarting:

```bash
rm -rf react-c2pa-player/node_modules/.vite
npm run dev -- --host 127.0.0.1 --port 5173
```

## Immediate Next Phase: HLS Stabilization

Goal: finish manual-test readiness for HLS before starting DASH.

1. Confirm the vendored fixed-bridge package remains in use and decide whether it should stay vendored or be replaced later by an upstream published release.
2. Rebuild with `npm run build`.
3. Start the dev server and manually test:
   - a known-good signed fMP4 HLS playlist,
   - a tampered HLS playlist,
   - an unsigned HLS playlist,
   - an existing monolithic MP4 regression sample.
4. Verify that the HLS path no longer fetches `https://contentcredentials.org/trust/*`.
5. Verify that the HLS path no longer hits the WASM integrity error.
6. Check timeline behavior during normal playback, seeking, and replay from time zero.
7. Regenerate lockfiles cleanly once npm install/package-lock refresh is behaving again; current WIP build succeeds, but lockfile refresh in the sandbox was unreliable.
8. Commit this stabilization checkpoint separately if it passes.

## HLS Follow-Up Work

- Replace the current incremental HLS timeline construction with bridge-derived segment intervals if the bridge exposes enough interval metadata reliably.
- Preserve pending/unknown state for fragments whose validation is not complete yet.
- Add a visible status/debug message for "HLS.js required" and fatal HLS errors.
- Decide whether HLS trust verification should always mirror monolithic behavior or be user/config controlled.
- If upstream publishes the fixed branch, replace the vendored package with the published version and drop the vendor directory.

## DASH Adapter Phase — Live, Implemented (uncommitted)

Goal was: add `dash-fragmented-fmp4` behind the same adapter boundary without changing monolithic/HLS behavior, targeting **live** DASH via `@qualabs/c2pa-live-dashjs-plugin` (`attachC2pa`) + `dashjs` (peer dep `>=4.0.0`, pinned to `^5.2.0`).

What shipped:

1. `dashjs` and `@qualabs/c2pa-live-dashjs-plugin` added as `dependencies`. `@qualabs/c2pa-live-videojs-ui` deliberately **not** installed — DASH surfaces through the existing custom C2PA menu/timeline, not a second UI system.
2. `src/validation/dashAdapter.ts` — `DashFragmentedFmp4Adapter` (`ownsPlayback: true`, `providesTimelineSegments: true`, `supportsLookupByTime: true`, `supportsTrustVerification: false`) + `DashFragmentedFmp4Session`, registered in `defaultRegistry.ts`.
3. `src/validation/runtimes/dashBridgeRuntime.ts` — dynamically imports `dashjs`/the plugin (code-split, not in the main bundle — confirmed via `npm run build`, `dash.all.min.js` lands in its own chunk), calls `attachC2pa()` before `player.initialize()`. The plugin has no time-indexed lookup (unlike the HLS bridge's `getC2PAMetaByTimeCode`) — it only emits `segmentValidated` events keyed by a manifest-derived sequence number. Real segment timing is correlated by listening to dash.js's own `MediaPlayer.events.FRAGMENT_LOADING_COMPLETED` (carries `request.startTime`/`request.duration`) and pairing entries FIFO per media type with incoming `segmentValidated` events — both listeners observe the same fragment downloads in the same order, so the two identifiers never need to match numerically. Falls back to an incremental nominal-duration estimate if a fragment's timing wasn't captured.
4. `src/validation/normalization/dash.ts` — maps `SegmentStatus` → `PlayerValidationState` (`valid`/`warning` → `Valid`, `invalid`/`replayed`/`reordered` → `Invalid`, `missing`/`unverified` → `Unknown`) and the plugin's thin `C2paManifest` → a `Manifest`-compatible object for the existing menu selectors. **Deliberately does not build a `ManifestStore`** via the shared `createCompatibilityManifestStore` helper — that helper's generic "any success code → Trusted" logic (via `getManifestStoreValidationState`) is a fair shortcut for HLS/monolithic, whose validators check a trust anchor list, but would misreport DASH's structurally-valid-but-trust-unconfirmed segments as "Trusted". Leaving `manifestStore` null makes `menuViewModel.ts` fall back to `normalizedResult.validationState` as-is.
5. Confirmed by reading the actual installed `@svta/cml-c2pa` source (not just docs): it does real COSE signature/hash/continuity verification (`verifyCoseSign1`, `validateManifestIntegrity`, etc.) but **no certificate trust-chain/anchor verification** — no "trust"/"anchor"/"CA" logic anywhere in it. This is why `supportsTrustVerification: false` and why `'valid'` maps to `Valid`, never `Trusted`.
6. New "Segment issues" menu section (`C2paMenu/components/LiveSegmentDiagnosticsSection.tsx` + `menuViewModel.ts`'s `liveSegments` section) lists non-`valid` segment statuses (segment number, media type, status, sequence-anomaly reason, error codes), capped at the 20 most recent with a "+N more not shown" note. Populated via a new optional `diagnostics?: TimelineSegmentDiagnostic[]` field on `ValidationTimelineSegment` — flows through to the menu for free since `C2PATimelineSegmentUpdate` is already a type alias of that type.
7. Fixed a real, previously-latent bug in `C2paTimeline/C2paTimelineFunctions.ts`: `replaceC2PATimelineSegments`/`updateC2PATimeline` only set a segment's `style.width` when `Number.isFinite(duration) && duration > 0`; a live source's `Infinity`/`NaN` duration left every segment at its default `0%` width, i.e. HLS's own timeline-segment path would already have silently rendered nothing for a hypothetical live/indefinite-duration HLS source. Added `getEffectiveTimelineDuration()` (falls back to `max(currentTime, latestKnownSegmentEnd, 1)` when duration isn't finite) — finite-duration behavior for monolithic/HLS is unchanged.

Verified so far: `tsc --noEmit` clean, `npm run build` succeeds (dash.js correctly code-split into its own chunk), `npm run dev` boots and serves the app, Vite's dependency pre-bundler resolves `dashjs`/`@qualabs/c2pa-live-dashjs-plugin`/`@svta/cml-c2pa` cleanly with **no `optimizeDeps.exclude` needed** (unlike the vendored HLS bridge — these are normally-published packages with correct `exports`/`dist` layout). The pre-existing CDN-loaded `dashjs@4.7.4` `<script>` in `index.html` was checked and does not conflict: its auto-init only scans for `[data-dashjs-player]`/`source[type="application/dash+xml"]` elements, and this app never renders either (Video.js gets no `<source>` at all when `capabilities.ownsPlayback` is true, for HLS or DASH).

**Not yet done — needs a real live DASH stream and a browser, neither available in the environment this was built in:**
- Manual playback of a known-good signed live DASH stream, a tampered/replayed-segment stream, and an unsigned stream. The qualabs toolkit's own repo ships `signer`/`streamer`/`attack-proxy` packages for generating exactly this kind of test fixture.
- Visual confirmation that the "Segment issues" menu section and the live timeline actually render/color correctly against real `segmentValidated` events.
- Confirming the `FRAGMENT_LOADING_COMPLETED`-based timing correlation actually lines up with real segment boundaries in the browser (the field names were verified against dash.js's own shipped `.d.ts`, but only a real network trace can confirm the interceptor payload shape end-to-end).
- Source-switch disposal check (switch to/from a live DASH source and confirm no leaked dash.js/controller listeners), same as the still-open HLS disposal item below.

## Extension Boundary Work

After HLS and DASH are stable, improve the adapter boundary for future formats:

- Add adapter capability metadata, for example `supportsLive`, `supportsSeeking`, `requiresPlayerOwnership`, and `requiresTrustSettings`.
- Move trust settings into a shared validation policy/provider instead of per-adapter hardcoding.
- Add a common adapter test harness for fake sessions and timeline snapshots.
- Document how to add new adapters such as live HLS, live DASH, MXF, or other monolithic file formats.
- Consider a first-class `ValidationSource` model for local files, remote URLs, object URLs, and server assets.

## Test And Release Checklist

- `npm run build`
- Manual monolithic MP4 regression test
- Manual HLS valid/tampered/unsigned tests
- Verify no unexpected remote trust-list fetches
- Verify no Vite WASM integrity failures
- Verify source switching disposes old validation sessions and player resources
- Commit each passing checkpoint
