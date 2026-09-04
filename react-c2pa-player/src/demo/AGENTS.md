# Instructions for this directory

This is the demo/dev harness app (`src/demo/`), not the publishable library
(`src/lib/`). Its Player Config panel
(`src/demo/components/PlayerConfigPanel.tsx`) is the visual surface for the
query-string switches documented in the top-level `README.md`'s "Runtime
parameters" table.

Whenever a query-string parameter under `src/lib/validation/policy/` (or a
selectable validation runtime under `src/lib/validation/runtimes/`) is
**added, extended with a new value/mode, or changed**, do the following in
the same change — a new `resolve*`/param is not complete without these:

1. **Add or update a matching control** in `PlayerConfigPanel.tsx`. A
   checkbox for an on/off switch, a `<select>` for an enumerated value, a
   number input for a numeric one — match whatever's already there for a
   similar param rather than inventing a new pattern.
2. **Give the control a `title` tooltip** whose wording matches (or is a
   short adaptation of) the "Runtime parameters" table in the top-level
   `README.md`. Update both together, in the same commit — not just the code
   comment, not just one of the two docs.
3. **If the parameter only takes effect during live playback** (like
   `?window=` and `?gate=`), put its control inside the panel's "Live-only
   settings" `<fieldset>` (not among the general controls), and disable it
   unless `detectAdapterKind(mediaSource)` is `'hls-fragmented-fmp4'` or
   `'dash-fragmented-fmp4'`. Disable both the individual control's own
   `disabled` prop *and* the fieldset — a fieldset's `disabled` attribute
   does not propagate to a descendant control's `.disabled` IDL property
   (verified: it affects interactivity and the `:disabled` CSS pseudo-class,
   but `input.disabled` reads back `false` regardless), so the fieldset
   alone is not enough for anything that reads the property, including this
   panel's own browser test. This is a format-capability approximation, not
   true per-manifest liveness — whether a specific loaded HLS/DASH file
   actually *is* live is only known after its manifest is parsed, deep
   inside the player, and isn't exposed outside it as of this writing. Don't
   use `capabilities.supportsLive` for this — that adapter capability means
   something narrower and is `false` for HLS even though HLS is how live is
   actually served.
4. **If the parameter only takes effect for one source format** (like
   `?monolithicEngine=`, which only affects monolithic MP4), disable the
   control unless `detectAdapterKind(mediaSource)` matches that format.
5. **Applying a change means two things, not one**: update the URL (so the
   setting stays shareable/bookmarkable — see `applyParam` in
   `PlayerConfigPanel.tsx`) and call the `onApply` callback, which the page
   uses to bump `VideoPlayerSection`'s `reloadToken` prop and force the
   currently loaded video to remount. A policy is only ever read once, at
   session creation (`createDefaultValidationPolicy()` inside
   `useC2PAPlayer.ts`'s `initializeValidation`) — reload-to-apply just makes
   that happen sooner than the next unrelated video load, without a full
   page refresh.
6. **Adding a new selectable validation *runtime*** (not just a policy
   switch) follows the same shape the `c2pa-web` monolithic engine did:
   implement the relevant `*ValidationRuntime` contract from
   `src/lib/validation/runtimes/contracts.ts` (it's small and structural —
   nothing bridge-specific is required by it), branch on the new policy
   field in the adapter's `createSession()`, and check whether
   `normalization/`, `rules.ts`, and `evidence.ts` already key off the
   standard `ManifestStore` shape before assuming they need a new branch —
   they may already handle it generically.
