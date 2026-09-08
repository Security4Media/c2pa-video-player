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

import { WITHHELD_IDENTITY_INFO_CAVEAT } from '@/lib/validation/rules';

/**
 * Says that Organization Identity, Copyright or AI opt-out have content this
 * player is withholding, without saying what - the content itself is exactly
 * what `showUnverifiedIdentity` being off means this app cannot vouch for.
 * Rendered in place of those sections (see `selectWithheldIdentityHint`),
 * never alongside them: once the flag is on, this disappears and they carry
 * their own `'Unknown'` badge instead.
 *
 * Shares its wording with the timeline hover's equivalent caveat (see
 * `WITHHELD_IDENTITY_INFO_CAVEAT`) - naming a specific category on one surface
 * while staying vague on the other would leak exactly what this hint exists to
 * keep from being said.
 */
export function WithheldIdentityHint() {
  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-withheld-hint">
        <p className="c2pa-withheld-hint__text">
          <span aria-hidden="true">❔ </span>
          {WITHHELD_IDENTITY_INFO_CAVEAT}
        </p>
      </div>
    </li>
  );
}
