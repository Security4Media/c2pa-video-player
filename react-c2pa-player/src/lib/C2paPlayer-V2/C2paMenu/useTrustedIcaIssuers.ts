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

import { useEffect, useState } from 'react';
import { selectedIcaIssuerProvider } from '@/lib/validation/policy';

const EMPTY_ISSUER_SET: ReadonlySet<string> = new Set();

/**
 * This app's own trusted CAWG ICA issuer DIDs.
 *
 * Unlike X.509 trust material, this never reaches the C2PA engine's own
 * `Settings` (no DID trust-anchor concept exists there) - it's read directly
 * by the menu, which is otherwise a pure function of `c2paStatus`/`timeline`.
 * Resolved once per mount into local state rather than threaded through the
 * validation session/adapter/snapshot chain: the list is independent of any
 * particular manifest, so it doesn't need to travel the same path as
 * per-asset validation results, and the menu is the only reader of it today.
 *
 * Starts empty (Creator section hidden) until the fetch resolves, the same
 * way the rest of the menu already tolerates a brief loading state.
 */
export function useTrustedIcaIssuers(): ReadonlySet<string> {
  const [issuers, setIssuers] = useState<ReadonlySet<string>>(EMPTY_ISSUER_SET);

  useEffect(() => {
    let cancelled = false;

    selectedIcaIssuerProvider()
      .load()
      .then((resolved) => {
        if (!cancelled) {
          setIssuers(resolved);
        }
      })
      .catch((error) => {
        console.warn('[C2PA] Failed to load the trusted ICA issuer list; Creator section will stay hidden.', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return issuers;
}
