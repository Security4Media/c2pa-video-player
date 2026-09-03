#!/usr/bin/env python3
"""
Reports on the trust bundles under trust/, and fails on the one fault that is
unambiguously a mistake.

Fails on: a certificate in dev/ that prod/ already carries. dev/ is an overlay,
and a duplicate there means it has started drifting into a second copy of the
production list, which is the failure mode the overlay layout exists to
prevent.

Warns, and does not fail, on:

  Expired certificates. 86 of the 192 entries here are already expired, nearly
  all of them in prod/allowed_list.pem, because the upstream public lists
  retain them deliberately: with a trusted RFC 3161 timestamp, content signed
  while a certificate was valid should still validate after it expires, so
  removing the entry would retroactively un-trust old content. Whether a given
  engine in this player honours that is not verified here. The warning is
  worth reading for dev/ in particular, where an expired entry usually means a
  test fixture has quietly stopped being able to reach Trusted.

  A certificate in the slot that cannot use it. The allow-list is matched
  against the leaf, so a CA certificate there is inert; a leaf in the anchors
  file only works if the engine treats it as a self-anchor. dev/ has one such
  entry on purpose (see its README) and correcting it would be a behaviour
  change disguised as tidying.

Usage:
  python3 scripts/verify_trust_bundles.py            # from react-c2pa-player/
  python3 scripts/verify_trust_bundles.py --json      # machine-readable

Needs openssl on the path; no Python packages.
"""

import base64
import datetime
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

TRUST = Path(__file__).resolve().parent.parent / 'trust'

# Only these are loaded by localTrustMaterialProvider.ts. fixtures/ is
# deliberately excluded: an empty list and an anchor belonging to no one are
# both "wrong" by every check here, which is what makes them useful.
ANCHOR_FILES = [
    'prod/trust_anchors.pem',
    'dev/dev_trust_anchors.pem',
    # Timestamp anchors land in the same pool, so they are checked as
    # anchors. The C2PA TSA trust list is fetched at runtime and is not
    # covered here.
    'tsa/tsa_trust_anchors.pem',
]
ALLOWED_FILES = ['prod/allowed_list.pem', 'dev/dev_allowed_list.pem']

EXPIRY_WARNING_DAYS = 90

BLOCK = re.compile(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', re.S)


def certificates(path):
    """Every PEM block in a file, with its SHA-256 fingerprint over the DER."""
    text = path.read_text(encoding='utf-8')
    for block in BLOCK.findall(text):
        der = base64.b64decode(''.join(block.splitlines()[1:-1]))
        yield hashlib.sha256(der).hexdigest().upper(), block


def openssl(block, *args):
    result = subprocess.run(
        ['openssl', 'x509', '-noout', *args],
        input=block, capture_output=True, text=True,
    )
    return result.stdout.strip()


def describe(block):
    subject = openssl(block, '-subject').replace('subject=', '')
    not_after = openssl(block, '-enddate').replace('notAfter=', '')
    is_ca = 'CA:TRUE' in openssl(block, '-ext', 'basicConstraints')
    try:
        expires = datetime.datetime.strptime(not_after, '%b %d %H:%M:%S %Y %Z')
    except ValueError:
        expires = None
    return {'subject': subject, 'expires': expires, 'ca': is_ca}


def main():
    as_json = '--json' in sys.argv
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

    slots = [('anchor', ANCHOR_FILES), ('allowed', ALLOWED_FILES)]
    inventory = []
    for slot, files in slots:
        for name in files:
            path = TRUST / name
            if not path.exists():
                sys.exit('missing bundle: %s' % name)
            for fingerprint, block in certificates(path):
                entry = describe(block)
                entry.update(
                    slot=slot, file=name, fingerprint=fingerprint,
                    layer=name.split('/')[0],
                )
                inventory.append(entry)

    duplicates = []
    for slot, _ in slots:
        prod = {e['fingerprint'] for e in inventory
                if e['slot'] == slot and e['layer'] == 'prod'}
        duplicates += [e for e in inventory
                       if e['slot'] == slot and e['layer'] != 'prod'
                       and e['fingerprint'] in prod]

    expired = [e for e in inventory if e['expires'] and e['expires'] < now]
    soon = [
        e for e in inventory
        if e['expires'] and now <= e['expires']
        and (e['expires'] - now).days <= EXPIRY_WARNING_DAYS
    ]
    misplaced = (
        [e for e in inventory if e['slot'] == 'allowed' and e['ca']]
        + [e for e in inventory if e['slot'] == 'anchor' and not e['ca']]
    )

    if as_json:
        def clean(entries):
            return [
                {k: (v.isoformat() if isinstance(v, datetime.datetime) else v)
                 for k, v in e.items()}
                for e in entries
            ]
        print(json.dumps({
            'counts': {
                name: sum(1 for e in inventory if e['file'] == name)
                for _, files in slots for name in files
            },
            'duplicates': clean(duplicates),
            'expired': clean(expired),
            'expiring_soon': clean(soon),
            'misplaced': clean(misplaced),
        }, indent=2))
    else:
        for _, files in slots:
            for name in files:
                count = sum(1 for e in inventory if e['file'] == name)
                print('%-32s %3d certificates' % (name, count))
        print()

        report('an overlay repeats what prod/ already has', duplicates,
               fatal=True)
        # Split by layer: an expired entry in prod/ is upstream's deliberate
        # choice, an expired entry in dev/ is usually a dead fixture.
        report('expired, outside prod/',
               [e for e in expired if e['layer'] != 'prod'], fatal=False)
        report('expires within %d days' % EXPIRY_WARNING_DAYS, soon, fatal=False)
        report('in the slot that cannot use it', misplaced, fatal=False)
        print('%d of %d entries are already expired (%d in prod/, retained '
              'upstream on purpose; see the module docstring)'
              % (len(expired), len(inventory),
                 sum(1 for e in expired if e['layer'] == 'prod')))
        print()

        if not duplicates:
            print('OK')

    return 1 if duplicates else 0


def report(heading, entries, fatal):
    if not entries:
        return
    print('%s %s (%d):' % ('FAIL' if fatal else 'warn', heading, len(entries)))
    for entry in entries:
        expires = entry['expires'].date().isoformat() if entry['expires'] else '?'
        print('  %-70s %s  %s' % (entry['subject'][:70], expires, entry['file']))
    print()


if __name__ == '__main__':
    sys.exit(main())
