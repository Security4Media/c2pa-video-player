# Trust material

This is the only trust directory in the repository. A byte-different duplicate
used to sit at the repository root; it was never read by any code and has been
removed. Everything under here is loaded by
`src/lib/validation/policy/localTrustMaterialProvider.ts`.

```
prod/       the pinned production bundle. The shipped policy.
tsa/        timestamp-authority anchors. Read by BOTH profiles.
dev/        test roots and broadcaster test identities. full-dev only.
fixtures/   an empty list and an anchor belonging to no one, for the negative
            controls in policy/trustFixtures.ts.
```

`tsa/` is not a development affordance and is deliberately not inside `dev/`:
without trusted timestamps, a signature made before its certificate expired is
judged against *now* and reads as untrusted, which is a wrong answer rather
than a cautious one. It also fetches the C2PA conformance TSA trust list at
runtime, which is the one network dependency the shipped policy has. See
`tsa/README.md`, including what it costs: the engine has a single anchor pool,
so a timestamp anchor widens claim-signer trust too.

## Which profile a page gets

| URL | Profile | Anchors and allow-list |
|---|---|---|
| no parameter | `full-prod` | `prod/` + `tsa/` |
| `?trust=full-prod` | `full-prod` | `prod/` + `tsa/` |
| `?trust=full-dev` | `full-dev` | `prod/` + `tsa/` + `dev/` |

`dev/` is never part of the shipped policy. It carries an EBU test root, the
C2PA test signer and several broadcaster test identities; a deployment that
trusted those would report test-signed content as authentic, which is the one
mistake a provenance player must not make. Selecting any profile other than
`full-prod` logs a warning to the console, so a verdict read off a screen can
be traced back to the policy that produced it.

The narrowing profiles (`anchors-only`, `empty`, `cawg-missing`,
`wrong-anchor`) start from `full-dev`, because they exist to demonstrate a
mechanism against the bundled test assets and several of those assets are
signed by roots only `dev/` carries.

## Adding a certificate

Append the PEM block to `dev/dev_allowed_list.pem` for an end-entity
certificate, or `dev/dev_trust_anchors.pem` for a CA. A timestamp-authority CA
goes in `tsa/tsa_trust_anchors.pem` instead, and is then trusted by both
profiles rather than only by `full-dev`. No code change is needed;
the file list in `localTrustMaterialProvider.ts` is per directory, not per
certificate. `#` comment lines are ignored by every parser in the path, so each
entry can carry its subject and fingerprint above it, and does.

To extract a certificate from a signed asset:

```
c2patool <file> --certs
```

The first block is the leaf. A CA block in the same chain belongs in the
anchors file, not beside the leaves: the allow-list is matched against the leaf
only.

Do not add test certificates to `prod/`. It is regenerated wholesale from
public sources (see `prod/README.md`) and a hand-added entry would be lost.

## Checking it

```
python3 scripts/verify_trust_bundles.py
```

Reports the inventory, fails if `dev/` or `tsa/` repeats anything `prod/`
already has (it caught one: DigiCert's current TimeStamping issuing CA),
and warns about certificates that have expired or are close to it. Worth
running before a demo: several of the bundled test certificates are short-lived
and an expired one reports as untrusted, which reads like a bug in the player.
