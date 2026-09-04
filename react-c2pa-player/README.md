# React C2PA Player

A React component library and pluggable validation-adapter framework for displaying [C2PA](https://c2pa.org/) Content Credentials during video playback, across three source kinds: monolithic (whole-file mp4/webm/mov), HLS (fragmented fMP4), and live DASH (fragmented fMP4).

Published as [`@security4media/c2pa-player`](#installing-the-package) via GitHub Packages. This
directory also contains the demo/dev harness app used to build and test it (`src/demo/`), and
serves as the source for a standalone Docker image (see the root `Dockerfile`).

## Layout

- `src/lib/` — the publishable library: everything under [Public API](#public-api-srclibindexts) below.
- `src/demo/` — the dev harness/demo app (`App.tsx`, `main.tsx`, `pages/StandalonePlayerPage.tsx`), not published. This is what `npm run dev`, `npm run build`, `npm run build-deploy` and `npm run build-container` all build.

## Architecture

`src/lib/validation/` is the adapter framework — nothing here is tied to one stream format:

- `registry.ts` resolves a `MediaSourceDescriptor` to the right adapter, using `sourceDetection.ts` (MIME type / extension / manifest content-type sniffing).
- Three adapters, one per source kind: `monolithicAdapter.ts`, `hlsAdapter.ts`, `dashAdapter.ts`. Each owns a **runtime** (`runtimes/`) that talks to the underlying validation library, and a **normalization** step (`normalization/`) that maps that library's adapter-specific output onto a shared shape (`types.ts`): `NormalizedValidationResult` and the `ManifestSource` union (`manifest-store` / `single-manifest` / `integrity-only` / `none`). The UI layer branches on `ManifestSource`, not on adapter kind.
- `emitter.ts` is the one shared pub/sub primitive every adapter session and runtime uses to notify subscribers of new validation results.
- `policy/localTrustMaterialProvider.ts` loads the local trust anchor/allow-list files and merges them with a remote community trust-anchor list, failing open to local-only if that fetch is unreachable (offline/air-gapped use).

**`hls.js` is pinned below 1.7** (`~1.6.18`, not `^1.6.16`): `@nettrek/c2pa-hls-bridge@0.5.0`
is not compatible with 1.7.x's parallelised init-segment loading. Confirmed by bisecting the
exact dependency version, nothing else: with 1.7.2 installed, `C2paHlsBridge.onFragLoading`
throws (`Cannot read properties of null (reading 'callbacks')`) and every fragment thereafter
fails with "Missing initSegment for fragment", on otherwise-identical code. Re-widening this
range needs the bridge to actually be verified against 1.7.x first.

**Validation engines:**
- Monolithic and HLS validate, by default, via the WebCrypto engine (`@nettrek/c2pa-web-crypto`) rather than the WASM engine (`@contentauth/c2pa-web`) that ships as those libraries' default. This sidesteps a bundler/WASM-integrity mismatch under this repo's dependency tree — see the comments in `runtimes/monolithicBridgeRuntime.ts` and `runtimes/hlsBridgeRuntime.ts`. HLS still falls back to WASM in browsers without `crypto.subtle`.
- Monolithic MP4 has a second, independent runtime, `runtimes/monolithicC2paWebRuntime.ts`, selectable via `?monolithicEngine=c2pa-web`. It calls this repo's own root-pinned `@contentauth/c2pa-web` directly rather than through `@nettrek/c2pa-hls-bridge`, so it never touches that bridge's nested copy of the package and isn't subject to the SRI mismatch above.
- DASH validates via `@qualabs/c2pa-live-dashjs-plugin` (dash.js + `@svta/cml-c2pa`), which performs cryptographic/structural checks only — no trust-anchor evaluation — so DASH segments are capped at `'Valid'`, never `'Trusted'` (see `rules.ts#getDashSegmentValidationState`).

**Player UI** (`src/lib/C2paPlayer-V2/`): the timeline is a legacy imperative Video.js/DOM integration, not a React tree, bridged into a small React-rendered menu (`C2paMenu/`) and friction-warning modal (`C2paFrictionModal/`) via a hand-rolled external store (`C2PAPlayerRoot.types.ts` — `getState`/`setState`/`subscribe`, no context/hooks). Clicking a non-Valid/Trusted timeline segment opens the menu into that fragment's own manifest or integrity verdict instead of the live/current status.

## Public API (`src/lib/index.ts`)

```ts
import { VideoPlayerSection, useC2PAPlayer } from '@security4media/c2pa-player';
import '@security4media/c2pa-player/style.css';
import type { C2PAStatus } from '@security4media/c2pa-player';
```

This is deliberately small — trimmed to what's actually consumed. `VideoPlayerSection` (which internally uses `useC2PAPlayer`) is what `src/demo/pages/StandalonePlayerPage.tsx` uses; that page, wired up via `src/demo/App.tsx`/`main.tsx`, is the demo app's entry point.

**Consumers need a Vite-based build.** `useC2PAPlayer` loads the C2PA WASM engine via a
Vite-only `?url` asset import (`@contentauth/c2pa-web/resources/c2pa.wasm?url`), which is left
external so consumers get their own installed copy rather than a second one bundled into this
package. Plain Node `require`/`import` and non-Vite bundlers cannot resolve that import, so this
package is published as ESM only and is only consumable from a Vite-based app today.

### Installing the package

The package is published to GitHub Packages, not the public npm registry. Add this to the
consuming project's `.npmrc`:

```
@security4media:registry=https://npm.pkg.github.com
```

Then:

```bash
npm install @security4media/c2pa-player
```

## Development

Run from the repository root (this package is an npm workspace member):

```bash
npm install
npm run dev             # Vite dev server (react-c2pa-player workspace)
npm run build            # tsc && vite build (src/demo app)
npm run build-deploy     # tsc && vite build --config vite.config.deploy.ts (GitHub Pages)
npm run build-container  # tsc && vite build --config vite.config.container.ts (Docker image)
npm run build-lib        # vite build --config vite.config.lib.ts (published package, dist-lib/)
npm run preview          # preview a production build
npm start                # http-server on :9000, serving the public/mp4s test fixtures
```

```bash
npm test                    # Vitest, the pure decision modules and sessions
npm run test:trust          # the trust bundles: duplication and expiry (no browser)
npm run test:browser        # the trust matrix: 11 source/policy cases end to end
npm run test:trust-profiles # what each ?trust= profile actually assembles
npm run test:keyboard       # the panel and the log without a mouse
npm run test:source-switch  # shared state cleared between sources
npm run test:friction       # the consent gate's legibility and focus handling
npm run test:authenticity   # the authenticity label and per-run consent
npm run test:seams          # the timeline bar, from screenshotted pixels
```

`test:trust` needs only Python and openssl, so it is the one to run after
editing a trust bundle. Pass `C2PA_TEST_ONLY='<substring of a case name>'` to
`test:browser` to run a single case instead of sitting through all eleven.

The browser checks drive a real Chromium against a running dev server, so start
one first (`npm run dev`) and point them at it with `C2PA_TEST_URL` if it is not
on the default port. They measure computed styles, hit-testing and focus rather
than snapshotting markup, which is what lets them catch the video.js cascade
beating our own rules.

Beyond that, verification is manual against the fixtures in `public/mp4s/`
(signed/unsigned/tampered variants), the HLS fixtures in `public/hls-fixtures/`,
and real HLS/DASH streams.

## Runtime parameters

Query-string switches, each defaulting to the behaviour a deployment gets
without it. They exist so the states below can be demonstrated and tested
against the same asset, rather than by hunting for content whose certificate
happens to be in the right state. The demo app's Player Config panel
(`src/demo/components/PlayerConfigPanel.tsx`) gives all of them a visual
control with a hover tooltip — the URL is still the source of truth, the
panel just reads and writes it.

| Parameter | Default | What it does |
|---|---|---|
| `?trust=<profile>` | `full-prod` | Swaps the trust material for one of the profiles in `policy/trustFixtures.ts`, so trusted / valid / untrusted outcomes can be shown on one file. Unrecognised values fall back to the shipped policy, which is the safe direction: a typo loses the diagnostic, never the trust policy. See the table below. |
| `?window=<seconds>` | 300 | How much of a live stream the player remembers: the width of the timeline window, the retained validation history, and the failure retention in the validation log. Values under 60 are ignored. Live only — see note below. |
| `?gate=off` | on | Turns off the validated-playback gate, which otherwise holds the picture rather than show live content whose verdict has not arrived. Only the exact value `off` disables it, since a switch that fails open on a typo is the wrong way round for a protection. Live only — see note below. |
| `?label=on` | off | Shows the authenticity label in the top-right of the picture, stating the provenance of the moment on screen. Green "Authenticity established" and blue "Valid" collapse to a dot after five seconds; red "Invalid Authenticity" and grey "Unknown provenance" stay expanded and pulse. Clicking it pauses and opens the Content Credentials panel. |
| `?consent=per-stream` | `whole-asset` | Asks once, the first time invalid content is actually played, and never again for that source. The overlay says outright that this is the only warning. |
| `?consent=per-run` | `whole-asset` | Asks once per contiguous stretch of invalid content, so a second bad stretch stops the picture again. |
| `?monolithicEngine=c2pa-web` | `nettrek` | Swaps the monolithic MP4 validation runtime from the shipped bridge-based one to an independent runtime that calls `@contentauth/c2pa-web` directly (see `runtimes/monolithicC2paWebRuntime.ts`). Has no effect on HLS/DASH. |

`?window=` and `?gate=` only ever affect a live source — both are no-ops on
VOD (`validatedPlaybackGate.ts`, `liveResume.ts`). The demo panel disables
both unless the loaded source's *format* can be live (HLS/DASH); it can't
know a specific HLS/DASH file actually *is* live before its manifest is
parsed, so that's an approximation, not a guarantee the control does
something. Likewise the panel disables `?monolithicEngine=` unless the
loaded source is a monolithic MP4, since that's the only format it affects.

`?monolithicEngine=c2pa-web` can reach a different verdict than the shipped
engine on the same asset with the same trust material — measured on
`PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4` with `?trust=full-dev`: the shipped
bridge reaches `Trusted`, this runtime stays at `Valid`, even with identical
trust anchors confirmed fed to both. That is the two engines' own
certificate-chain logic disagreeing, not a bug in how this repo wires trust
material to either of them — part of the point of exposing the switch is
making that kind of disagreement visible rather than hiding it behind one
shipped engine.

### Choosing a trust profile

| `?trust=` | Certificates | For |
|---|---|---|
| omitted, or `full-prod` | `trust/prod/` + `trust/tsa/` | what a deployment does. Test-signed content reads as valid but untrusted |
| `full-dev` | the same, plus `trust/dev/` | demoing the bundled test assets, which are signed by test roots |
| `anchors-only` | `full-dev`, allow-lists emptied | proving trust can be reached by chaining rather than by allow-listing |
| `cawg-missing` | `full-dev`, CAWG identity policy emptied | proving the CAWG identity is evaluated separately from the claim |
| `empty` | nothing, timestamp anchors included | proving a correctly signed asset still validates, untrusted |
| `wrong-anchor` | one anchor belonging to no one | negative control |

The last two clear `trust/tsa/` as well, both the file and the fetch. It lands
in the same anchor pool as everything else, so inheriting it would quietly
refill the two profiles whose whole job is to have nothing to chain to.

The four narrowing profiles start from `full-dev`, not from the shipped policy:
they demonstrate a mechanism against the bundled test assets, and several of
those are signed by roots only `trust/dev/` carries. Started from `full-prod`,
`anchors-only` would find nothing to chain to and would stop telling "this
signer is allow-listed, not chainable" apart from "there are no anchors at all".

#### What changes when no profile is selected

Measured, because it is the question anyone reviewing this will ask:

| Content | `full-prod` (default) | `full-dev` |
|---|---|---|
| WDR live HLS, production certificates | **Trusted** | Trusted |
| `PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4` and the other EBU PTS demo files | **Valid** | Trusted |
| Tampered fixtures | Invalid | Invalid |

Real broadcaster content signed with production certificates is unaffected.
The EBU PTS demo MP4s drop from Trusted to Valid, and the deciding certificate
was bisected rather than guessed: adding the **EBU test root** alone to
`trust/prod/trust_anchors.pem` restores Trusted, and Adobe Product Services G4
on its own does not. Valid is the correct verdict there. The signature is
sound and the claim signer is on the production allow-list; what is missing is
anything in a production trust list vouching for a test CA. Add `?trust=full-dev`
to demo those files as Trusted.

Both directions are locked in by `npm run test:browser`, and
`npm run test:trust-profiles` prints what each profile actually assembles.

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

`react-c2pa-player/trust/` is the only trust directory; a byte-different
duplicate used to sit at the repository root, was read by no code, and has been
removed. `LocalTrustMaterialProvider`
(`src/lib/validation/policy/localTrustMaterialProvider.ts`) loads everything
under it, via root-relative Vite asset imports (`/trust/...pem?url`). Those
resolve against this package's root regardless of where the importing file sits
under `src/`, so the same trust material is used by the demo build, the
container build and the published library build alike. Full detail is in
`trust/README.md`; the short version:

```
trust/prod/    the pinned production bundle. The shipped policy.
trust/tsa/     timestamp-authority anchors. Read by BOTH profiles.
trust/dev/     test roots and broadcaster test identities. full-dev only.
trust/fixtures/  an empty list and an anchor belonging to no one.
```

`trust/dev/` is an **overlay**: it holds only what `prod/` does not, and both
profiles name the same production file. A self-contained dev bundle would be a
second copy of 178 certificates that drifts every time `prod/` is regenerated.

`trust/tsa/` is not a development affordance, which is why it sits beside
`prod/` rather than inside `dev/`. A C2PA signature carries an RFC 3161
timestamp, and if that timestamp cannot be trusted the signing certificate is
judged against *now* instead of the moment it signed, so content signed
correctly before its certificate expired reads as untrusted. 86 of the 192
bundled certificates are already expired, so that is the common case here. It
holds the CAs behind `http://timestamp.digicert.com` and fetches the C2PA
conformance TSA trust list at runtime, which is the one network dependency the
shipped policy has. `trust/tsa/README.md` says what it costs; the short version
is that the engine has a single anchor pool, so a timestamp anchor widens
claim-signer trust as well.

**The shipped policy does not trust any test certificate.** A page with no
`?trust=` parameter gets `prod/` alone, so test-signed content reports as valid
but untrusted, which is the correct answer for a deployment. The test material
is reachable only through `?trust=full-dev`, and selecting any non-default
profile logs a console warning so a verdict read off a screen can be traced to
the policy that produced it.

### Adding a certificate

Append the PEM block to `trust/dev/dev_allowed_list.pem` for an end-entity
certificate or `trust/dev/dev_trust_anchors.pem` for a CA. No code change: the
provider names directories' files, not individual certificates. To get the
certificate out of a signed asset, `c2patool <file> --certs` prints the chain,
leaf first; a CA in that chain belongs in the anchors file, because the
allow-list is only ever matched against the leaf.

Do not hand-edit `trust/prod/`. It is regenerated wholesale from public sources
(see `trust/prod/README.md`) and an added entry would be lost.

### Checking it

```
npm run test:trust
```

Fails if `dev/` has started duplicating `prod/`, and warns about expired
certificates. 86 of the 192 entries are already expired, nearly all in `prod/`,
which is upstream's deliberate choice rather than a fault: with a trusted
timestamp, content signed while a certificate was valid can still validate.
The warning matters most for `dev/`, where an expired entry usually means a
demo fixture has quietly stopped reaching Trusted. **The BBC test certificate
expires 2026-09-18.**

### Three separate ways trust can fail

Worth knowing when a certificate is present and the verdict is still not
Trusted, because they need different fixes:

1. the leaf is not on the allow-list and its chain reaches no anchor;
2. the chain reaches an anchor but an intermediate is missing (some assets do
   not carry their issuer, which is why `dev/` anchors the DigiCert SMIME
   intermediate);
3. the certificate's extended key usage is not in `trust/prod/c2pa_store.cfg`.
   That file lists six OIDs and is used for both the C2PA and CAWG policies.
   `cawg_store.cfg` is narrower and is currently **not read**; see
   `trust/prod/README.md` for why that decision is still open.

A fourth, separate from the three above: the signature's **timestamp** may be
untrusted, in which case the certificate is checked against now rather than
against its signing time, and an otherwise sound signature by a since-expired
certificate reads as Valid rather than Trusted. That is what `trust/tsa/` is
for. TSA trust is anchor-only and gated on `id-kp-timeStamping`, so a
timestamp authority cannot be allow-listed into trust, only anchored.

## License

Apache License 2.0. Part of the EBU C2PA Player project.
