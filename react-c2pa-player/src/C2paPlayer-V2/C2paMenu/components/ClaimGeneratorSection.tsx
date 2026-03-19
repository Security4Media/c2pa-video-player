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
