/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Assigns a colour to each issuer name a live session sees, for
 * `?issuerColors=on` (see policy/issuerColors.ts).
 *
 * Issuer names are never known ahead of time - a deployment may point this
 * player at any stream, signed by any number of organisations - so there is
 * no fixed issuer-to-colour mapping to ship. Instead, colours are handed out
 * from a small fixed palette in the order issuers are first seen, which is
 * enough to make a rotating-signer stream visually distinguishable without
 * having to know or hardcode who the signers are.
 */

/** How many blue-ish tokens design-tokens.css defines for this. */
const PALETTE_SIZE = 6;

/**
 * The issuer palette, read once per render pass - same reasoning as
 * `readVerdictColors` in C2paTimelineFunctions.ts: `getComputedStyle` forces a
 * style recalculation, and this is read at most once a tick rather than once
 * per segment.
 */
export function readIssuerPaletteColors(): readonly string[] {
  const style = getComputedStyle(document.documentElement);

  return Array.from({ length: PALETTE_SIZE }, (_, index) =>
    style.getPropertyValue(`--c2pa-issuer-${index + 1}`).trim(),
  );
}

export interface IssuerColorAssigner {
  /**
   * The colour for this issuer, stable for the assigner's lifetime.
   *
   * First-seen order, not a hash of the name: a session-scoped assignment is
   * simpler to reason about and to test, and "the first issuer this stream
   * showed is colour 1" is no less meaningful to a viewer than a hash would
   * be. Wraps around the palette if more issuers appear than it has entries,
   * which trades losing distinctness for never running out of a colour to
   * give.
   *
   * `palette` is taken per call, not read once at construction: a caller
   * painting many segments in one render pass reads it once and passes the
   * same array to every call (see `readIssuerPaletteColors`'s own doc comment
   * on why - the same reasoning `readVerdictColors` is built on), so this
   * stays free of `getComputedStyle` and safe to construct anywhere.
   */
  colorFor(issuer: string, palette: readonly string[]): string;
}

/**
 * One assigner per player session (see `getTimelineFunctions`, which creates
 * exactly one and is itself created once per player instance) - so the
 * mapping resets on every reload/source change rather than accumulating
 * forever, and the timeline and the authenticity label can share one instance
 * to guarantee they agree on a given issuer's colour.
 */
export function createIssuerColorAssigner(): IssuerColorAssigner {
  const assigned = new Map<string, string>();

  return {
    colorFor(issuer: string, palette: readonly string[]): string {
      const existing = assigned.get(issuer);

      if (existing !== undefined) {
        return existing;
      }

      const color = palette[assigned.size % palette.length];
      assigned.set(issuer, color);

      return color;
    },
  };
}
