import type {
  CawgOrganizationItem,
  OrganizationIdentityItem,
  OrganizationSectionItem,
} from '../models';
import { WebsiteLink } from './shared';

function getValidationIndicator(validationStatus: CawgOrganizationItem['validationStatus']) {
  if (validationStatus === 'Trusted') {
    return {
      icon: '✅',
      message: 'Trusted: the organization identity credentials are trusted.',
    };
  }

  if (validationStatus === 'Valid') {
    return {
      icon: '☑️',
      message: 'Valid: the organization identity is valid, but the signing credentials are not fully trusted.',
    };
  }

  return {
    icon: '❌',
    message: 'Invalid: the organization identity could not be verified.',
  };
}

function OrganizationDetails({ organization }: { organization: OrganizationIdentityItem }) {
  return (
    <div className="c2pa-org-section__details">
      {organization.name ? <div>{organization.name}</div> : null}
      {organization.website ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">Website:</span> <WebsiteLink href={organization.website} />
        </div>
      ) : null}
      {organization.identifier ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">Identifier:</span> {organization.identifier}
        </div>
      ) : null}
      {organization.leiCode ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">LEI:</span> {organization.leiCode}
        </div>
      ) : null}
      {organization.iso6523Code ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">ISO 6523:</span> {organization.iso6523Code}
        </div>
      ) : null}
    </div>
  );
}

function IdentityDetails({ itemValue }: { itemValue: CawgOrganizationItem }) {
  return (
    <div className="c2pa-org-section__identity">
      {itemValue.issuer ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">Identity Signer:</span> {itemValue.issuer}
        </div>
      ) : null}
      {itemValue.role ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">Role:</span> {itemValue.role}
        </div>
      ) : null}
      {itemValue.creativeWork?.datePublished ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">Published:</span> {itemValue.creativeWork.datePublished}
        </div>
      ) : null}
      {itemValue.creativeWork?.license ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">License:</span> <WebsiteLink href={itemValue.creativeWork.license} />
        </div>
      ) : null}
      {Array.isArray(itemValue.authors) && itemValue.authors.length > 0 ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">Authors:</span>{' '}
          {itemValue.authors.map(author => author.name).filter(Boolean).join(', ')}
        </div>
      ) : null}
    </div>
  );
}

export function OrganizationSection({
  section,
  title,
}: {
  section: OrganizationSectionItem;
  title: string;
}) {
  const validationIndicator = section.cawg
    ? getValidationIndicator(section.cawg.validationStatus)
    : null;

  return (
    <li className="vjs-menu-item">
      <div className="c2pa-org-section">
        <div className="c2pa-org-section__header">
          <span className="itemName c2pa-org-section__title">{title}</span>
          {validationIndicator ? (
            <span
              className="c2pa-org-section__status"
              aria-label={`Organization identity status: ${section.cawg?.validationStatus}`}
              title={validationIndicator.message}
            >
              {validationIndicator.icon}
            </span>
          ) : null}
        </div>
        {section.organization ? <OrganizationDetails organization={section.organization} /> : null}
        {section.cawg ? <IdentityDetails itemValue={section.cawg} /> : null}
      </div>
    </li>
  );
}
