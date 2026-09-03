# React C2PA Player

A React component library and pluggable validation-adapter framework for displaying [C2PA](https://c2pa.org/) Content Credentials during video playback, across three source kinds: monolithic (whole-file mp4/webm/mov), HLS (fragmented fMP4), and live DASH (fragmented fMP4).

## Architecture

`src/validation/` is the adapter framework — nothing here is tied to one stream format:

- `registry.ts` resolves a `MediaSourceDescriptor` to the right adapter, using `sourceDetection.ts` (MIME type / extension / manifest content-type sniffing).
- Three adapters, one per source kind: `monolithicAdapter.ts`, `hlsAdapter.ts`, `dashAdapter.ts`. Each owns a **runtime** (`runtimes/`) that talks to the underlying validation library, and a **normalization** step (`normalization/`) that maps that library's adapter-specific output onto a shared shape (`types.ts`): `NormalizedValidationResult` and the `ManifestSource` union (`manifest-store` / `single-manifest` / `integrity-only` / `none`). The UI layer branches on `ManifestSource`, not on adapter kind.
- `emitter.ts` is the one shared pub/sub primitive every adapter session and runtime uses to notify subscribers of new validation results.
- `policy/localTrustMaterialProvider.ts` loads the local trust anchor/allow-list files and merges them with a remote community trust-anchor list, failing open to local-only if that fetch is unreachable (offline/air-gapped use).

**Validation engines:**
- Monolithic and HLS validate via the WebCrypto engine (`@nettrek/c2pa-web-crypto`) rather than the WASM engine (`@contentauth/c2pa-web`) that ships as those libraries' default. This sidesteps a bundler/WASM-integrity mismatch under this repo's dependency tree — see the comments in `runtimes/monolithicBridgeRuntime.ts` and `runtimes/hlsBridgeRuntime.ts`. HLS still falls back to WASM in browsers without `crypto.subtle`.
- DASH validates via `@qualabs/c2pa-live-dashjs-plugin` (dash.js + `@svta/cml-c2pa`), which performs cryptographic/structural checks only — no trust-anchor evaluation — so DASH segments are capped at `'Valid'`, never `'Trusted'` (see `rules.ts#getDashSegmentValidationState`).

**Player UI** (`src/C2paPlayer-V2/`): the timeline is a legacy imperative Video.js/DOM integration, not a React tree, bridged into a small React-rendered menu (`C2paMenu/`) and friction-warning modal (`C2paFrictionModal/`) via a hand-rolled external store (`C2PAPlayerRoot.types.ts` — `getState`/`setState`/`subscribe`, no context/hooks). Clicking a non-Valid/Trusted timeline segment opens the menu into that fragment's own manifest or integrity verdict instead of the live/current status.

## Public API (`src/index.ts`)

```ts
import { VideoPlayerSection, useC2PAPlayer } from 'react-c2pa-player';
import type { C2PAStatus } from 'react-c2pa-player';
```

This is deliberately small — trimmed to what's actually consumed. `VideoPlayerSection` (which internally uses `useC2PAPlayer`) is what `src/pages/StandalonePlayerPage.tsx` uses; that page, wired up via `App.tsx`/`main.tsx`, is the actual app entry point.

## Development

Run from the repository root (this package is an npm workspace member):

```bash
npm install
npm run dev            # Vite dev server (react-c2pa-player workspace)
npm run build           # tsc && vite build
npm run build-deploy    # tsc && vite build --config vite.config.deploy.ts (GitHub Pages)
npm run preview         # preview a production build
npm start               # http-server on :9000, serving the public/mp4s test fixtures
```

```bash
npm test                    # Vitest, the pure decision modules and sessions
npm run test:browser        # the trust matrix: 10 source/policy cases end to end
npm run test:keyboard       # the panel and the log without a mouse
npm run test:source-switch  # shared state cleared between sources
npm run test:friction       # the consent gate's legibility and focus handling
npm run test:authenticity   # the authenticity label and per-run consent
npm run test:seams          # the timeline bar, from screenshotted pixels
```

The browser checks drive a real Chromium against a running dev server, so start
one first (`npm run dev`) and point them at it with `C2PA_TEST_URL` if it is not
on the default port. They measure computed styles, hit-testing and focus rather
than snapshotting markup, which is what lets them catch the video.js cascade
beating our own rules.

Beyond that, verification is manual against the fixtures in `public/mp4s/`
(signed/unsigned/tampered variants), the HLS fixtures in `public/hls-fixtures/`,
and real HLS/DASH streams.

## Runtime parameters

Query-string only, and each one defaults to the behaviour a deployment gets
without it. There is no UI surface for any of them: they exist so the states can
be demonstrated and tested against the same asset, rather than by hunting for
content whose certificate happens to be in the right state.

| Parameter | Default | What it does |
|---|---|---|
| `?trust=<fixture>` | the shipped policy | Swaps the trust material for one of the fixtures in `policy/trustFixtures.ts` (`full`, `anchors-only`, `cawg-missing`, `empty`), so trusted / valid / untrusted outcomes can be shown on one file. Unrecognised values fall back to the shipped policy. |
| `?window=<seconds>` | 300 | How much of a live stream the player remembers: the width of the timeline window, the retained validation history, and the failure retention in the validation log. Values under 60 are ignored. |
| `?gate=off` | on | Turns off the validated-playback gate, which otherwise holds the picture rather than show live content whose verdict has not arrived. Only the exact value `off` disables it, since a switch that fails open on a typo is the wrong way round for a protection. |
| `?label=on` | off | Shows the authenticity label in the top-right of the picture, stating the provenance of the moment on screen. Green "Authenticity established" and blue "Valid" collapse to a dot after five seconds; red "Invalid Authenticity" and grey "Unknown provenance" stay expanded and pulse. Clicking it pauses and opens the Content Credentials panel. |
| `?consent=per-stream` | `whole-asset` | Asks once, the first time invalid content is actually played, and never again for that source. The overlay says outright that this is the only warning. |
| `?consent=per-run` | `whole-asset` | Asks once per contiguous stretch of invalid content, so a second bad stretch stops the picture again. |

### Choosing a consent mode

| | `whole-asset` (default) | `per-stream` | `per-run` |
|---|---|---|---|
| When it is raised | From the `play` handler, only if the manifest is already known bad | The first time invalid content plays | On entering each invalid stretch |
| Works on live DASH / HLS | No | Yes | Yes |
| Works on a monolithic MP4 | Yes | Yes | Yes (one run) |
| Times it can appear | Once per source | Once per source | Once per stretch |
| Re-asks after returning to sound content | n/a | No | Yes |

`whole-asset` cannot fire mid-playback on a fragmented source, and in practice
cannot fire on one at all: its verdict needs fragments, fragments need
playback, and the first play marks playback as accepted. That gap is why the
other two exist.

Both new modes share everything except how long the "already asked" memory
lasts, the stretch or the source. On a live stream either one carries a
countdown and withdraws itself if the pause would outlast what the origin
retains, after which that stretch is never asked about again (otherwise
withdrawing at a live edge still inside the bad content would ask and withdraw
forever).

`?label=on` and `?consent=` are independent. A deployment may want to state
provenance continuously without interrupting the viewer, or interrupt on bad
content without leaving a permanent badge over live output; those are different
editorial decisions and neither implies the other.

## Trust material

`react-c2pa-player/trust/` holds the local trust-anchor/allow-list/config files that `LocalTrustMaterialProvider` loads. A second, byte-different `trust/` directory exists at the repository root — only `react-c2pa-player/trust/` is actually read by code; the root one should be reconciled or clarified with whoever owns trust-anchor provisioning.

## License

Apache License 2.0. Part of the EBU C2PA Player project.
