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

No automated test suite exists — verification is manual, against the fixtures in `public/mp4s/` (signed/unsigned/tampered variants) and real HLS/DASH streams.

## Trust material

`react-c2pa-player/trust/` holds the local trust-anchor/allow-list/config files that `LocalTrustMaterialProvider` loads. A second, byte-different `trust/` directory exists at the repository root — only `react-c2pa-player/trust/` is actually read by code; the root one should be reconciled or clarified with whoever owns trust-anchor provisioning.

## License

Apache License 2.0. Part of the EBU C2PA Player project.
