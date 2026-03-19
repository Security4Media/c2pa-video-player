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
      <MenuField label={title} value={value} multiline={value.length >= 23} />
    </li>
  );
}
