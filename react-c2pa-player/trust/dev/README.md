# Development-only trust material

Loaded on top of `../prod/` by the `full-dev` profile (`?trust=full-dev`).
Never by the shipped policy.

These two files are an **overlay, not a bundle**: they hold only what `prod/`
does not already contain. That is deliberate. A self-contained dev bundle would
be a second copy of 178 production certificates that silently drifts every time
`prod/` is regenerated, and the drift would show up as a demo that disagrees
with the deployed player for reasons nobody can find.

Both files are annotated: each entry carries its subject, its SHA-256
fingerprint and the file it came from, above the PEM block.

## dev_trust_anchors.pem, 7 certificates

| Certificate | Why it is here |
|---|---|
| EBU Root CA (EBU Root Certifcate Authority/Media security) | EBU test signing chain |
| C2PA Test Intermediate Root CA (two entries) | the C2PA SDK's own test chain |
| C2PA Test Signing Cert / C2PA Signer | `cawg_robot_wdr_c2pa.mp4` chains to this |
| DigiCert Assured ID Root CA | root of the CBC test chain |
| DigiCert Assured ID SMIME RSA2048 SHA256 2021 CA1 | issuer of the CBC test identities; two of the CBC fixtures do not carry it in their own chain, so it has to be an anchor for them to chain at all |
| Adobe Product Services G4 | Adobe-signed fixtures |

Note that `C2PA Signer` is an end-entity certificate sitting in an anchors
file. That is how it was configured before this reorganisation and it has been
left alone: moving it to the allow-list would change which of the two routes to
Trusted it takes, and that is a behaviour change disguised as tidying.

## dev_allowed_list.pem, 7 certificates

| Certificate | Why it is here |
|---|---|
| BBC (Test), OU=FOR_TESTING_ONLY | extracted from `BBC-placed-ingredients.mp4`. **Expires 2026-09-18** |
| Canadian Broadcasting Corporation, `CN=c2pa@cbc.ca` (SN=Testeau) | the older CBC test identity, used by `CBC_Test_Signed_ibc.mp4`. CBC's *production* identity (`CN=cbc.ca`) is in the IPTC list and therefore already in `prod/` |
| RADIO NEW ZEALAND LIMITED | was in the previous allow-list and is not in the current public lists. Expired 2026-05-13 |
| NIKON CORPORATION (four entries) | same. All four expired, between 2024-09-26 and 2025-11-06 |

RNZ and Nikon are production publisher certificates, not test material, and
all five are expired. They are carried here rather than dropped because an
expired allow-list entry is not necessarily inert: with a trusted RFC 3161
timestamp, content signed while the certificate was valid can still validate,
which is why the upstream public lists retain expired entries too. Whether the
engines in this player honour that has not been verified. They are not in
`prod/` because `prod/` is regenerated from its upstream sources, which no
longer carry them, so a hand-added entry would be lost at the next
regeneration.

## Expiry

`python3 scripts/verify_trust_bundles.py` lists this. Two things there need
watching rather than reading once:

- **The BBC test certificate expires 2026-09-18.** After that
  `BBC-placed-ingredients.mp4` stops reaching Trusted under `full-dev` unless
  its signature carries a timestamp, and the player will report it as valid but
  untrusted. That is the correct verdict, but it looks like a regression, so it
  is worth knowing before a demo rather than during one.
- 86 of the 192 entries across both directories are already expired, 81 of them
  in `prod/`. That is upstream's deliberate choice, not a fault here.

## Regenerating

There is no script: the contents are hand-curated per fixture, and a
regeneration script would need the 362 MB and 125 MB source media, which are
deliberately not in the repository. To add a certificate see `../README.md`.
