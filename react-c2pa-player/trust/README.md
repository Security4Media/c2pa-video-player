# Trust material

This is the only trust directory in the repository. A byte-different duplicate
used to sit at the repository root; it was never read by any code and has been
removed. Everything under here is loaded by
`src/validation/policy/localTrustMaterialProvider.ts`.

```
prod/       the pinned production bundle. The shipped policy, and nothing else.
dev/        test roots and broadcaster test identities, layered on top of prod.
fixtures/   an empty list and an anchor belonging to no one, for the negative
            controls in policy/trustFixtures.ts.
```

## Which profile a page gets

| URL | Profile | Anchors and allow-list |
|---|---|---|
| no parameter | `full-prod` | `prod/` only |
| `?trust=full-prod` | `full-prod` | `prod/` only |
| `?trust=full-dev` | `full-dev` | `prod/` + `dev/` |

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
certificate, or `dev/dev_trust_anchors.pem` for a CA. No code change is needed;
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

Reports the inventory, fails if `dev/` repeats anything `prod/` already has,
and warns about certificates that have expired or are close to it. Worth
running before a demo: several of the bundled test certificates are short-lived
and an expired one reports as untrusted, which reads like a bug in the player.
