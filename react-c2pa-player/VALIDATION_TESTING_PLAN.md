# Validation testing and refactoring plan

Scope: C2PA and CAWG trust validation for HLS (fragmented) and MP4 (monolithic),
covering trusted, valid and invalid outcomes, plus per-fragment validity and
trust for HLS.

## Why this shape

One bug has now appeared six times: code reading a raw engine store shape,
written against the WASM layout, breaking under WebCrypto.

| Site | Status |
|---|---|
| `getHlsValidationState` | fixed |
| `getCAWGValidationStatus` | fixed |
| `getManifestStoreValidationState` | fixed |
| synthetic store's `success: [{}]` placeholder | fixed |
| `getIngredientValidationStatus` (`services/c2pa_functions.ts`) | **live bug**: returns `Invalid` whenever `validation_results` is absent, so every ingredient in the provenance history is mislabelled under WebCrypto |
| `C2paMenuBridge.ts` (`validation_state` read) | a third independent interpretation |

The two engines disagree on shape:

| | WASM (`@contentauth/c2pa-web`) | WebCrypto (`@nettrek/c2pa-web-crypto`) |
|---|---|---|
| `validation_results.activeManifest` | per-code `success` / `failure` | **absent** |
| `validation_status` | not used | flat list of failures |
| `validation_state` | present | present, authoritative |
| positive trust signal | `signingCredential.trusted` | none, absence of failure |
| untrusted CAWG code | `signingCredential.untrusted` + URL | `cawg.identity.untrusted` |

Tests alone do not stop the seventh occurrence. The refactor removes the class.

## Part A. Refactoring

### A1. One verdict boundary

Replace six independent interpretations with a single normalisation step:

```ts
interface ValidationEvidence {
  state: 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
  failures: { code: string; scope: 'manifest' | 'fragment' | 'identity'; url?: string }[];
  identity: 'Trusted' | 'Valid' | 'Invalid' | 'Absent';
}
```

Every consumer (menu, timeline, adapters) reads only this.

- SRP: one place decides what a verdict means.
- DIP: the UI depends on an abstraction, not on a vendor payload.

Collapses `getManifestStoreValidationState`, `getCAWGValidationStatus`,
`getHlsValidationState`, `classifyFailureScope`, `isCawgIdentityUntrustedFailure`
and the duplicated `isUntrusted*` predicates into one module, and makes the whole
trust matrix testable with plain objects.

### A2. Engine readers (open/closed)

Three functions feeding A1: `fromWasmStore`, `fromWebCryptoStore`,
`fromBridgeReader`. A future engine is one new function, not six edits.

### A3. Inject the bridge

Both runtimes call `new C2paHlsBridge(...)` / `new C2paMp4Bridge(...)` directly,
so there is no seam. Add a factory to the policy/context so adapter and session
logic (watched-timeline gating, whole-asset scoping, snapshot emission) can be
tested with a fake bridge and no browser.

### A4. Split the trust provider

`LocalTrustMaterialProvider` mixes Vite `?url` imports, `fetch`, and a
module-level `trustMaterialPromise` cache. That cache is shared global mutable
state and leaks between tests. Split into pure `buildTrustMaterial(texts)` plus
an I/O loader, and move the cache onto the instance.

### A5. Conciseness pass

- Drop `getValidationResultsForManifest` (a two-line wrapper, re-exported, used twice).
- Fold `services/c2pa_functions.ts` into the verdict module.
- `bundle-barrel-imports`: five barrels under `src/validation/`; import direct paths at app entry.
- `js-tosorted-immutable`: `mergeSegments`, `getFragmentVerdicts`.
- `async-parallel` is already satisfied.

## Part B. Test infrastructure

Vitest, two projects:

- `unit` (node): the bulk of the matrix.
- `browser` (Playwright): a thin smoke matrix.

A browser case costs 20 to 30 seconds even at 8x playback, so a 30-case matrix is
unworkable there and trivial as unit tests. The three existing ad-hoc suites
(gate 25 cases, projector 14, scope 10) get ported to `src/**/*.test.ts`.

## Part C. Trust-list fixtures

Today, reaching Trusted rather than Valid depends on picking an asset whose
certificate happens to be in the right state. That is what broke: the `PTS_*`
fixture names drifted from reality as certificates expired. Drive the outcome
from configuration instead, so it stays stable.

| Fixture | Contents | Drives |
|---|---|---|
| `full` | anchors + allow-list with the test signer | Trusted |
| `anchors-only` | anchors, empty allow-list | Trusted only via chain |
| `empty` | neither | Valid (signed, untrusted) |
| `cawg-missing` | C2PA full, CAWG list empty | C2PA Trusted + CAWG untrusted |
| `wrong-anchor` | unrelated CA | negative control |

`cawg-missing` is the discriminator proving CAWG is validated independently. It
makes permanent the manual experiment where emptying `cawgTrust` demoted the
stream from Trusted to Valid and flipped the identity indicator.

## Part D. Matrices

### Unit, per engine shape (WASM and WebCrypto), about 24 cases

- Trusted / Valid / Invalid for the C2PA claim signer.
- Trusted / Valid / Invalid for the CAWG identity.
- Identity independence: C2PA trusted with CAWG untrusted gives overall Valid, identity Valid.
- Scope classification: `bmffHash` is fragment-scoped; `hashedURI` and `claimSignature` are manifest-scoped.
- The code-less-placeholder fallback (synthetic store).
- Ingredient status (currently broken, so this starts red).

### HLS per-fragment, unit

- Fragment verdict sets to timeline colours.
- Three tampered runs with clean gaps between them.
- Whole-asset scoping: a manifest failure fills the bar, a fragment failure does not.
- Watched-gating: unplayed spans stay grey.
- The existing gate and projector suites.

### Browser smoke, 10 cases

| Source | Trust fixture | Overall | CAWG | Timeline |
|---|---|---|---|---|
| HLS untampered | full | Trusted | Trusted | read fragments green |
| HLS untampered | cawg-missing | Valid | Valid | blue |
| HLS untampered | empty | Valid | Valid | blue |
| HLS segs-corrupt | full | per-fragment | Trusted | clean green, tampered red |
| HLS init-tampered | full | Invalid | hidden | whole bar red |
| MP4 signed | full | Trusted | Trusted | n/a |
| MP4 signed | cawg-missing | Valid | Valid | n/a |
| MP4 signed | empty | Valid | Valid | n/a |
| MP4 tampered | full | Invalid | hidden | n/a |
| MP4 unsigned | full | No manifest | hidden | n/a |

### Two fixture gaps

- An MP4 tampered variant generated by the same script that produced the HLS
  ones (flip a byte in the manifest store), so it is reproducible rather than a
  curated file.
- `data-testid` and `data-validation-state` attributes on the summary and
  organization sections. Browser tests currently scrape `innerText` and emoji
  (white heavy check mark, ballot box with check, cross mark), which is brittle.

## Part E. Sequencing

1. A1 and A2, migrating all six sites. No behaviour change, and it fixes the
   ingredient bug as a side effect.
2. Vitest, port the three existing suites.
3. Trust fixtures and the unit matrix.
4. A3, adapter tests with a fake bridge.
5. Browser smoke matrix and testids.
6. A5 conciseness pass.

## Open decisions

**Certificate expiry makes media fixtures time-bombs.** The `PTS_*` assets
already drifted this way. Keep precise assertions in unit tests and let browser
tests assert only "no expiry-related failure", so they do not fail on a calendar
date.

**The netTrek engine divergence needs a stance.** It hard-fails a store when a
timestamp-less ingredient's certificate has expired; c2patool does not. Tests
either encode current behaviour (locking in something arguably wrong) or are
marked known-divergent pending an upstream answer. Recommendation: mark
divergent and raise it with netTrek, since the engine's own `refTime` logic
already handles timestamps correctly when one is present.
