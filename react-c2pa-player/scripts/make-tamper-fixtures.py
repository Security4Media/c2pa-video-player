#!/usr/bin/env python3
"""
Builds tampered copies of C2PA-signed media, for exercising a player's tamper
detection.

The assets themselves are deliberately not committed: they are large, and they
are derived from content that is fetched or already in the repository. This
script is what is kept, so a fixture can always be rebuilt.

HLS, from https://wdr-c2pa.ard-mcdn-dev.de/test_big_6 (360p rendition, 16
fragments of ~8s), written to public/hls-fixtures/:

  tampered-init            the manifest store in init.mp4 is altered
  tampered-segs-corrupt    3 runs of 4 fragments have their Merkle hashes corrupted
  tampered-segs-stripped   the same 3 runs have their C2PA box removed outright

Monolithic, from an existing signed asset in public/mp4s/:

  TAMPERED_<name>.mp4      one byte altered inside the manifest store

Every edit preserves MP4 box structure so the media still plays and only the
C2PA checks fail - the point is to test validation, not to break decoding.

Usage:
  python3 scripts/make-tamper-fixtures.py hls   <work-dir>   # needs source/ prepared
  python3 scripts/make-tamper-fixtures.py mp4   <asset.mp4>
"""

import shutil
import struct
import sys
from pathlib import Path

C2PA_BMFF_UUID = bytes.fromhex('d8fec3d61b0e483c92975828877ec481')

# 3 runs of 4 consecutive fragments, with clean fragments between them so the
# timeline has distinguishable good/bad regions rather than one solid block.
TAMPERED_RUNS = [(2, 5), (8, 11), (13, 16)]

# The com.example.rights assertion is plain JSON inside the manifest store.
# Replacement is the same byte length, so every enclosing box size stays valid
# and the file remains parseable - only the assertion's hash no longer matches.
RIGHTS_BEFORE = b'{"license":"CC-BY-4.0","owner":"WDR"}'
RIGHTS_AFTER = b'{"license":"CC-BY-9.9","owner":"XYZ"}'


def tampered_indices() -> set[int]:
    return {i for start, end in TAMPERED_RUNS for i in range(start, end + 1)}


def read_box_header(buf: bytes, offset: int) -> tuple[int, bytes]:
    size = struct.unpack('>I', buf[offset:offset + 4])[0]
    return size, buf[offset + 4:offset + 8]


def find_c2pa_box(buf: bytes) -> tuple[int, int]:
    """Offset and size of the top-level C2PA uuid box."""
    offset = 0
    while offset + 8 <= len(buf):
        size, typ = read_box_header(buf, offset)
        if size < 8:
            break
        if typ == b'uuid' and buf[offset + 8:offset + 24] == C2PA_BMFF_UUID:
            return offset, size
        offset += size
    raise SystemExit('No C2PA uuid box found - is this a C2PA-signed fMP4?')


def corrupt_merkle_hashes(segment: bytes) -> bytes:
    """
    Flips bytes inside the fragment's Merkle proof hashes, leaving every length
    untouched.

    The proof is CBOR inside the C2PA uuid box: a map whose "hashes" key holds
    an array of 32-byte strings (0x58 0x20 prefix). Corrupting the bytes rather
    than deleting them keeps the structure well-formed, so the validator reads a
    proof and finds it wrong - a genuine mismatch rather than absent data.
    """
    box_offset, box_size = find_c2pa_box(segment)
    box = bytearray(segment[box_offset:box_offset + box_size])

    marker = box.find(b'fhashes')
    if marker < 0:
        raise SystemExit('No "hashes" array in the fragment proof')

    cursor = marker + len(b'fhashes')
    if not (0x80 <= box[cursor] <= 0x9f):
        raise SystemExit(f'Expected a CBOR array after "hashes", got {box[cursor]:#x}')

    cursor += 1  # step over the array header
    corrupted = 0
    while cursor + 2 < len(box) and box[cursor] == 0x58 and box[cursor + 1] == 0x20:
        digest_at = cursor + 2
        # Flip every byte of the digest: no partial-collision ambiguity, and it
        # cannot accidentally leave the original value in place.
        for i in range(digest_at, digest_at + 32):
            box[i] ^= 0xFF
        corrupted += 1
        cursor = digest_at + 32

    if corrupted == 0:
        raise SystemExit('Found no 32-byte digests to corrupt')

    return segment[:box_offset] + bytes(box) + segment[box_offset + box_size:]


def strip_c2pa_box(segment: bytes) -> bytes:
    """Removes the fragment's C2PA box entirely, leaving moof/mdat intact."""
    box_offset, box_size = find_c2pa_box(segment)
    return segment[:box_offset] + segment[box_offset + box_size:]


def tamper_init(init: bytes) -> bytes:
    box_offset, box_size = find_c2pa_box(init)
    at = init.find(RIGHTS_BEFORE, box_offset, box_offset + box_size)
    if at < 0:
        raise SystemExit('Rights assertion not found in the manifest store')
    assert len(RIGHTS_BEFORE) == len(RIGHTS_AFTER), 'replacement must not change length'
    return init[:at] + RIGHTS_AFTER + init[at + len(RIGHTS_BEFORE):]


def write_playlists(target: Path, source: Path) -> None:
    shutil.copy(source / 'media.m3u8', target / 'media.m3u8')
    # Single video-only rendition: deterministic (no ABR switching to a
    # different, untampered rendition) and enough to exercise validation.
    (target / 'master.m3u8').write_text(
        '#EXTM3U\n'
        '#EXT-X-VERSION:6\n'
        '#EXT-X-INDEPENDENT-SEGMENTS\n'
        '#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=764588,BANDWIDTH=983191,'
        'VIDEO-RANGE=SDR,CODECS="avc1.4D401F",RESOLUTION=640x360,FRAME-RATE=50.000\n'
        'media.m3u8\n'
    )


def build(source: Path, out_root: Path) -> None:
    targets = {
        'tampered-init': ('init', None),
        'tampered-segs-corrupt': (None, corrupt_merkle_hashes),
        'tampered-segs-stripped': (None, strip_c2pa_box),
    }
    marked = tampered_indices()

    for name, (init_mode, segment_fn) in targets.items():
        target = out_root / name
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)

        init = (source / 'init.mp4').read_bytes()
        if init_mode == 'init':
            init = tamper_init(init)
        (target / 'init.mp4').write_bytes(init)

        changed = []
        for index in range(1, 17):
            filename = f'seg-{index:05d}.m4s'
            data = (source / filename).read_bytes()
            if segment_fn and index in marked:
                data = segment_fn(data)
                changed.append(index)
            (target / filename).write_bytes(data)

        write_playlists(target, source)
        detail = f'segments {changed}' if changed else 'init.mp4 manifest store'
        print(f'  {name:24s} tampered: {detail}')


def build_tampered_mp4(asset: Path) -> Path:
    """
    Alters one byte inside a monolithic asset's manifest store.

    Deep enough inside to be past the box header and the UUID, so the file
    still parses and only the C2PA checks notice. Verified on
    PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4, where it moves c2patool's verdict
    from Valid to Invalid while leaving the file the same size.
    """
    data = asset.read_bytes()
    box_offset, _ = find_c2pa_box(data)
    target = box_offset + 512

    tampered = bytearray(data)
    tampered[target] ^= 0xFF

    out = asset.with_name(f'TAMPERED_{asset.name}')
    out.write_bytes(bytes(tampered))
    print(f'  {out.name}: byte {target} altered inside the manifest store')

    return out


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'hls'

    if mode == 'mp4':
        build_tampered_mp4(Path(sys.argv[2]))
    else:
        root = Path(sys.argv[2] if len(sys.argv) > 2 else '.')
        build(root / 'source', root / 'out')
