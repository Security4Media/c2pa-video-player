# Timestamp-authority trust

Read by **both** `full-prod` and `full-dev`. Unlike `../dev/`, this is not a
development affordance: a C2PA signature carries an RFC 3161 timestamp, and if
that timestamp cannot be trusted the signing certificate is judged against
*now* instead of against the moment it signed. Content signed correctly before
its certificate expired then reads as untrusted, which is a wrong answer rather
than a cautious one. 86 of the 192 certificates in `../prod/` and `../dev/` are
already expired, so this is the common case here, not an edge one.

Two sources:

| Source | How | What |
|---|---|---|
| `tsa_trust_anchors.pem` | this file | the CAs behind `http://timestamp.digicert.com` |
| C2PA TSA trust list | fetched at runtime | the conformance programme's TSA roots and ICAs, 22 certificates |

The C2PA list is fetched from
`https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/trust-list/C2PA-TSA-TRUST-LIST.pem`
rather than vendored, so it stays current without a rebuild. It fails open: an
unreachable list means timestamps are validated but not trusted, which is the
same degradation as having no list at all. It is, however, **the one runtime
network dependency the shipped policy has**, which is a change from `prod/`
being deliberately self-contained. Vendoring it is a one-line change if that
trade is not wanted.

The two are complementary rather than overlapping. The C2PA list carries
DigiCert's *C2PA-specific* TSA roots (`DigiCert RSA4096 Root for C2PA G1` and
the ECC equivalent); it does not carry `DigiCert Trusted Root G4`, which is
what `timestamp.digicert.com` actually chains to. Measured overlap: **16 of the
22** C2PA TSA entries are already in `../prod/trust_anchors.pem`, so the fetch
adds six and, more importantly, keeps the set current.

## What was already there

Worth stating plainly, because it changes what this directory is for.
`../prod/trust_anchors.pem` **already anchors
`DigiCert Trusted G4 TimeStamping RSA4096 SHA256 2025 CA1`**, the issuing CA
that `timestamp.digicert.com` presents today. So that TSA already chained to an
anchor before any of this, and the check here caught the duplicate rather than
letting it be added a second time.

What this file adds is the **root above it**, which `prod/` does not have. That
matters when DigiCert rotates the issuing CA: today's chain terminates at an
intermediate pinned by name and serial, and the next one will not be in
`prod/` until `prod/` is regenerated. Anchoring the root means the rotation is
invisible instead of a silent loss of timestamp trust.

## tsa_trust_anchors.pem, 2 certificates

Taken from a real RFC 3161 response, so what is recorded is what that service
presents rather than what a repository says it should:

```
openssl ts -query -data <file> -no_nonce -sha256 -cert -out tsq.tsq
curl -H "Content-Type: application/timestamp-query" --data-binary @tsq.tsq \
     http://timestamp.digicert.com -o tsr.tsr
openssl ts -reply -in tsr.tsr -token_out -out token.der
openssl pkcs7 -inform DER -in token.der -print_certs
```

| Certificate | Why |
|---|---|
| DigiCert Trusted Root G4, cross-signed by DigiCert Assured ID Root CA | the root as that TSA actually serves it |
| DigiCert Trusted Root G4, self-signed | the same root from `cacerts.digicert.com`, so the chain terminates whether or not the cross-signed path is taken |

The issuing CA from the same response is **not** here: `prod/` already has it,
and duplicating it is exactly what `npm run test:trust` fails on.

**The responder leaf is deliberately absent.** TSA trust in
`@nettrek/c2pa-web-crypto` is anchor-only: `tsaTrustStore` empties
`allowedEndEntities`, on the reasoning that an allow-listed C2PA signing
certificate could otherwise be accepted as a trusted TSA and used to forge
trusted timestamps. A leaf here would be inert, and this one is named
"2026 1" and rotates.

## What this costs, and it is not nothing

**A TSA anchor widens claim-signer trust too.** The engine has one anchor pool:
`tsaTrustStore(store)` spreads the caller's store and only narrows
`allowedEku` to `id-kp-timeStamping` and empties `allowedEndEntities`. There is
no TSA-only anchor slot to put these in, so anything these CAs issue can also
be considered for C2PA claim signing.

That is sharpened by `../prod/c2pa_store.cfg` listing
`1.3.6.1.5.5.7.3.8` (id-kp-timeStamping) among the six EKUs acceptable for
claim signing. A DigiCert timestamp responder certificate therefore satisfies
the EKU policy for signing claims, not only for stamping them. Nothing here
introduced that OID, but adding these anchors is what makes it reachable.

Removing `1.3.6.1.5.5.7.3.8` from the claim-signing EKU list would close it,
and is very likely correct, but it is a trust-policy decision with a blast
radius beyond this directory, so it is written down rather than taken. Raise it
with whoever owns trust provisioning; `../prod/README.md` has the related
`cawg_store.cfg` question.

## Checking it

`python3 scripts/verify_trust_bundles.py` counts this file with the anchors and
warns on expiry. Nothing here is near-term: the issuing CA and the self-signed
root both run to January 2038, and the cross-signed root to November 2031. The
C2PA list is fetched, so that check does not cover it at all.

Each entry carries its subject, issuer, expiry and SHA-256 fingerprint above
the PEM block, so this file can be diffed against a fresh TSA response without
re-deriving anything.
