# Trust list files

These files hold the certificate data used for `trust_anchors` and `allowed_list`
in C2PA sdk settings toml. Sections `[trust]`and `[cawg_trust]`, kept identical between the two sections.

Last generated: 2026-09-02

## trust_anchors.pem

Merged and deduplicated (by SHA-256 fingerprint of the DER, 56 unique certs) from:

- https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/anchors.pem
- https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/trust-list/C2PA-TRUST-LIST.pem

## allowed_list.pem

Merged and deduplicated (by SHA-256 fingerprint of the DER, 122 unique certs) from:

- https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem
- https://www.iptc.org/verified-news-publishers-list/verified-news-publishers-list.pem


## How the player loads these

`src/lib/validation/policy/localTrustMaterialProvider.ts` reads all four files.
This directory *is* the shipped policy: `defaultTrustResourceUrls` names these
files and nothing else, so a page with no `?trust=` parameter trusts exactly
what is here. `../dev/` is layered on only by `?trust=full-dev`.

`includeRemote` is **false** for this profile. The two contentauth community
lists are already merged in above, pinned as of the generation date, so
fetching them again at runtime would add nothing except a trust decision that
depends on whether GitHub answered. `../dev/` still fetches them, since it is
the only place a newly published signer appears without regenerating a bundle.

Do not hand-edit these files. They are regenerated wholesale from the sources
listed above, and an added entry would be lost at the next regeneration. Test
certificates belong in `../dev/`.

## c2pa_store.cfg and cawg_store.cfg

Both list permitted extended-key-usage OIDs. A certificate whose EKU is not in
the list is rejected even with a clean chain and a place on the allow-list, so
this is a third and separate way for trust to fail.

**Only `c2pa_store.cfg` is read.** `buildTrustMaterial` uses one configuration
for both the `[trust]` and `[cawg_trust]` sections, so the narrower
`cawg_store.cfg` (two OIDs, against six) is currently unused. It is kept
because it is part of the generated set and because narrowing the CAWG identity
to e-mail protection and document signing may well be correct; it would drop
`c2pa-kp-claimSigning` (1.3.6.1.4.1.62558.2.1), which would stop any signer
whose only EKU is claim signing from being accepted as a CAWG identity.

Wiring it up is a small change (a second config slot on `TrustResourceUrls`,
threaded to `cawgTrust.trustConfig`), but it is a trust-policy decision rather
than a code one and needs whoever owns trust provisioning to say which
behaviour is intended. Untested either way as things stand.
