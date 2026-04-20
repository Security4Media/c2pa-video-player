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
    // const signedByText = itemValue.issuer
    //   ? `Issued by ${itemValue.role ? ` by ${itemValue.role}` : ''}: ${itemValue.issuer}`
    //   : null;
  const signedByText = itemValue.issuer
  return (
    <div className="c2pa-org-section__identity">
      {signedByText ? (
        <div className="c2pa-org-section__row">
          {signedByText}
        </div>
      ) : null}
      {itemValue.creativeWork?.datePublished ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">Published on :</span> {itemValue.creativeWork.datePublished}
        </div>
      ) : null}
      {itemValue.creativeWork?.license ? (
        <div className="c2pa-org-section__row">
          <span className="itemName">Under license:</span> <WebsiteLink href={itemValue.creativeWork.license} />
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
         {section.cawg ? <IdentityDetails itemValue={section.cawg} /> : null}
        {section.organization && (
          section.organization.website ||
          section.organization.identifier ||
          section.organization.leiCode ||
          section.organization.iso6523Code
        ) ? (
          <details className="c2pa-org-section__collapsible" tabIndex={0}>
            <summary className="c2pa-org-section__collapsible-summary">Organization Details</summary>
            <OrganizationDetails organization={section.organization} />
          </details>
        ) : null}
       
      </div>
    </li>
  );
}
