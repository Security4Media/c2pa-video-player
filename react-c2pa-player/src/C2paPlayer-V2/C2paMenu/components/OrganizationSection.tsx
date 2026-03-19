import type {
  CawgOrganizationItem,
  OrganizationIdentityItem,
  OrganizationSectionItem,
} from '../models';
import { ValidationBadge, WebsiteLink } from './shared';

function OrganizationDetails({ organization }: { organization: OrganizationIdentityItem }) {
  return (
    <>
      {organization.name ? <div>{organization.name}</div> : null}
      {organization.website ? (
        <div>
          <span className="itemName">Website:</span> <WebsiteLink href={organization.website} />
        </div>
      ) : null}
      {organization.identifier ? (
        <div>
          <span className="itemName">Identifier:</span> {organization.identifier}
        </div>
      ) : null}
      {organization.leiCode ? (
        <div>
          <span className="itemName">LEI:</span> {organization.leiCode}
        </div>
      ) : null}
      {organization.iso6523Code ? (
        <div>
          <span className="itemName">ISO 6523:</span> {organization.iso6523Code}
        </div>
      ) : null}
    </>
  );
}

function CawgIdentityDetails({
  itemValue,
  isExpanded,
  onToggle,
}: {
  itemValue: CawgOrganizationItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const validationStatus = itemValue.validationStatus;

  return (
    <>
      <div className="cawg-header" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <span className="itemName">Publisher Identity (CAWG)</span>
        <span className={`cawg-toggle ${isExpanded ? 'expanded' : ''}`}>›</span>
      </div>
      <div className="cawg-identity" style={{ display: isExpanded ? 'flex' : 'none' }}>
        {itemValue.issuer ? (
          <div>
            <span className="itemName">Issuer:</span> {itemValue.issuer}
          </div>
        ) : null}
        {itemValue.role ? (
          <div>
            <span className="itemName">Role:</span> {itemValue.role}
          </div>
        ) : null}
        {validationStatus ? (
          <div>
            <span className="itemName">Validation Status:</span>{' '}
            <ValidationBadge value={validationStatus} />
          </div>
        ) : null}
        {itemValue.creativeWork?.organization?.name ? (
          <div>
            <span className="itemName">Organization:</span> {itemValue.creativeWork.organization.name}
          </div>
        ) : null}
        {itemValue.creativeWork?.datePublished ? (
          <div>
            <span className="itemName">Published:</span> {itemValue.creativeWork.datePublished}
          </div>
        ) : null}
        {itemValue.creativeWork?.license ? (
          <div>
            <span className="itemName">License:</span> <WebsiteLink href={itemValue.creativeWork.license} />
          </div>
        ) : null}
        {Array.isArray(itemValue.authors) && itemValue.authors.length > 0 ? (
          <div>
            <span className="itemName">Authors:</span>{' '}
            {itemValue.authors.map(author => author.name).filter(Boolean).join(', ')}
          </div>
        ) : null}
      </div>
    </>
  );
}

export function OrganizationSection({
  section,
  title,
  isExpanded,
  onToggleCawg,
}: {
  section: OrganizationSectionItem;
  title: string;
  isExpanded: boolean;
  onToggleCawg: () => void;
}) {
  return (
    <li className="vjs-menu-item">
      <div className="ingredients-container">
        <div className="ingredients-main-header">
          <span className="itemName">{title}</span>
        </div>
        {section.organization ? <OrganizationDetails organization={section.organization} /> : null}
        {section.cawg ? (
          <CawgIdentityDetails
            itemValue={section.cawg}
            isExpanded={isExpanded}
            onToggle={onToggleCawg}
          />
        ) : null}
      </div>
    </li>
  );
}
