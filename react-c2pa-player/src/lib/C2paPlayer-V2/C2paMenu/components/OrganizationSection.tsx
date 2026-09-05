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
import { REFERENCED_CONTENT_HIDDEN_NOTE, UNVERIFIED_IDENTITY_CAVEAT } from '@/lib/validation/rules';
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

  // Nobody checked. Distinct from Invalid, and it used to fall through to it:
  // any status that was not Trusted or Valid rendered a red cross reading
  // "could not be verified", which on a DASH stream - where the engine runs no
  // identity check at all - accused a signer the player had never examined.
  // Also reached when there is no store to read a verdict from.
  if (validationStatus === 'Unknown') {
    return {
      icon: '❔',
      message: `Not verified: ${UNVERIFIED_IDENTITY_CAVEAT}`,
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
        <div className="c2pa-menu-section__row">
          <span className="itemName">Website:</span> <WebsiteLink href={organization.website} />
        </div>
      ) : null}
      {organization.identifier ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">Identifier:</span> {organization.identifier}
        </div>
      ) : null}
      {organization.leiCode ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">LEI:</span> {organization.leiCode}
        </div>
      ) : null}
      {organization.iso6523Code ? (
        <div className="c2pa-menu-section__row">
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
        <div className="c2pa-menu-section__row">
          {signedByText}
        </div>
      ) : null}
      {itemValue.creativeWork?.datePublished ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">Published on :</span> {itemValue.creativeWork.datePublished}
        </div>
      ) : null}
      {itemValue.creativeWork?.license ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">Under license:</span> <WebsiteLink href={itemValue.creativeWork.license} />
        </div>
      ) : null}
      {itemValue.dublinCore?.title ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">Title:</span> {itemValue.dublinCore.title}
        </div>
      ) : null}
      {itemValue.dublinCore?.publisher ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">Publisher:</span> {itemValue.dublinCore.publisher}
        </div>
      ) : null}
      {itemValue.dublinCore?.creator ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">Creator:</span> {itemValue.dublinCore.creator}
        </div>
      ) : null}
      {itemValue.dublinCore?.description ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">Description:</span> {itemValue.dublinCore.description}
        </div>
      ) : null}
      {itemValue.dublinCore?.rights ? (
        <div className="c2pa-menu-section__row">
          <span className="itemName">Rights:</span> {itemValue.dublinCore.rights}
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
      <div className="c2pa-menu-section c2pa-org-section">
        <div className="c2pa-menu-section__header">
          <span className="itemName c2pa-menu-section__title">{title}</span>
          {validationIndicator ? (
            <span
              className="c2pa-org-section__status"
              aria-label={`Organization identity status: ${section.cawg?.validationStatus}`}
              title={validationIndicator.message}
              data-testid="c2pa-identity-status"
              data-validation-state={section.cawg?.validationStatus ?? 'Unknown'}
            >
              {validationIndicator.icon}
            </span>
          ) : null}
        </div>
         {/* Referenced content (title, publisher, license, copyright...) is
            withheld rather than shown-with-a-caveat below Trusted: it is
            unauthenticated by definition unless the identity vouching for it
            is itself trusted. */}
        {section.cawg && section.cawg.validationStatus === 'Trusted' ? (
          <IdentityDetails itemValue={section.cawg} />
        ) : null}
        {/* Spelled out rather than left to the icon's tooltip. The whole point
            of this section is the names in it, and a viewer reading a title
            and a publisher has no reason to hover a glyph to find out that
            nothing vouched for them. */}
        {section.cawg?.validationStatus === 'Unknown' ? (
          <p className="c2pa-org-section__caveat">{UNVERIFIED_IDENTITY_CAVEAT}</p>
        ) : null}
        {section.cawg && section.cawg.validationStatus !== 'Trusted' ? (
          <p className="c2pa-org-section__caveat">{REFERENCED_CONTENT_HIDDEN_NOTE}</p>
        ) : null}
        {section.organization && (
          section.organization.website ||
          section.organization.identifier ||
          section.organization.leiCode ||
          section.organization.iso6523Code
        ) ? (
          // No `tabIndex` here: <summary> is already focusable and operable, so
          // one on the <details> only added a preceding tab stop where Enter
          // does nothing.
          <details className="c2pa-org-section__collapsible">
            <summary className="c2pa-org-section__collapsible-summary">Organization Details</summary>
            <OrganizationDetails organization={section.organization} />
          </details>
        ) : null}
       
      </div>
    </li>
  );
}
