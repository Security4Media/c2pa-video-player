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

import type { ClaimGeneratorSectionItem } from '../models';
import { MenuField } from './shared';

export function ClaimGeneratorSection({
  section,
  title,
}: {
  section: ClaimGeneratorSectionItem;
  title: string;
}) {
  const value = section.products
    .map(product => (product.version ? `${product.name} ${product.version}` : product.name))
    .join(', ');

  if (!value) {
    return null;
  }

  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-claim-generator-section">
        <div className="c2pa-claim-generator-section__value">
          <MenuField label={title} value={value} multiline={value.length >= 23} />
        </div>
      </div>
    </li>
  );
}
