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

import type { ReactNode } from 'react';
import { useId } from 'react';
import type { CreatorIdentityGroup, CreatorSectionItem, VerifiedIdentityClaim } from '../models';
import { SectionToggle } from './shared';

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" role="presentation">
      <rect x="1" y="1" width="22" height="22" rx="4" fill="#0A66C2" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontFamily="sans-serif" fontWeight="700" fill="#fff">in</text>
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" role="presentation">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** Generic external-link glyph, for any social provider this app has no dedicated icon for. */
function GenericLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" role="presentation">
      <path
        d="M8.5 15.5c-1.4 1.4-3.6 1.4-5 0s-1.4-3.6 0-5l2-2c1.4-1.4 3.6-1.4 5 0M15.5 8.5c1.4-1.4 3.6-1.4 5 0s1.4 3.6 0 5l-2 2c-1.4 1.4-3.6 1.4-5 0M10 14l4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Distinct from the social-provider icons above: this is not a profile link, it's a claim that an identity document was checked. */
function VerifiedBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" role="presentation">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M7.5 12.5l2.8 2.8 6.2-6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SOCIAL_PROVIDER_ICONS: Record<string, () => ReactNode> = {
  linkedin: () => <LinkedInIcon />,
  instagram: () => <InstagramIcon />,
};

function formatVerifiedDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function humanizeClaimType(type: string): string {
  return type.replace(/^cawg\./, '').replace(/_/g, ' ');
}

interface ClaimPresentation {
  icon: ReactNode;
  label: string;
  describe: string;
}

/**
 * How to render one verified-identity claim, keyed by its `type`. A claim
 * type this app has never seen falls through to `genericClaim`, so a future
 * CAWG ICA claim type needs a new registry entry here, not new branching
 * logic elsewhere.
 */
const CLAIM_PRESENTERS: Record<string, (claim: VerifiedIdentityClaim) => ClaimPresentation> = {
  'cawg.social_media': (claim) => {
    const icon = SOCIAL_PROVIDER_ICONS[claim.providerName?.toLowerCase() ?? ''];

    return {
      icon: icon ? icon() : <GenericLinkIcon />,
      label: claim.displayName ?? claim.providerName ?? 'Verified profile',
      describe: [
        `Verified ${claim.providerName ?? 'social media'} profile`,
        claim.verifiedAt ? `on ${formatVerifiedDate(claim.verifiedAt)}` : null,
      ].filter(Boolean).join(' '),
    };
  },
  'cawg.document_verification': (claim) => ({
    icon: <VerifiedBadgeIcon />,
    label: claim.displayName ?? 'Identity verified',
    describe: [
      'Identity verified',
      claim.providerName ? `via ${claim.providerName}` : null,
      claim.verifiedAt ? `on ${formatVerifiedDate(claim.verifiedAt)}` : null,
    ].filter(Boolean).join(' '),
  }),
};

function genericClaim(claim: VerifiedIdentityClaim): ClaimPresentation {
  return {
    icon: <GenericLinkIcon />,
    label: claim.displayName ?? humanizeClaimType(claim.type),
    describe: [
      humanizeClaimType(claim.type),
      claim.providerName ? `via ${claim.providerName}` : null,
      claim.verifiedAt ? `verified ${formatVerifiedDate(claim.verifiedAt)}` : null,
    ].filter(Boolean).join(' '),
  };
}

function ClaimRow({ claim }: { claim: VerifiedIdentityClaim }) {
  const { icon, label, describe } = (CLAIM_PRESENTERS[claim.type] ?? genericClaim)(claim);
  const content = (
    <>
      <span className="c2pa-creator-section__claim-icon" aria-hidden="true">{icon}</span>
      <span className="c2pa-creator-section__claim-label">{label}</span>
    </>
  );

  return (
    <div className="c2pa-menu-section__row c2pa-creator-section__claim">
      {claim.uri ? (
        <a
          className="c2pa-creator-section__claim-link"
          href={claim.uri}
          target="_blank"
          rel="noreferrer"
          title={describe}
        >
          {content}
        </a>
      ) : (
        <span className="c2pa-creator-section__claim-link" title={describe}>
          {content}
        </span>
      )}
    </div>
  );
}

/**
 * Per-group verdict. `Invalid` never reaches this component -
 * `selectCreatorSection` withholds a confirmed-broken credential entirely -
 * but the fallback stays, the same defensive shape `OrganizationSection`'s
 * `getValidationIndicator` uses, rather than assuming the selector can never
 * change.
 */
function getValidationIndicator(status: CreatorIdentityGroup['validationStatus']) {
  if (status === 'Trusted') {
    return {
      icon: '✅',
      message: "Trusted: this identity's issuer is on this player's trusted list.",
    };
  }

  if (status === 'Valid') {
    return {
      icon: '☑️',
      message: "Valid: this credential's signature checks out, but its issuer is not on this player's trusted list.",
    };
  }

  if (status === 'Unknown') {
    return {
      icon: '❔',
      message: 'Not verified: declared in the stream; the active validation engine does not check this credential\'s signature.',
    };
  }

  return {
    icon: '❌',
    message: 'Invalid: this identity credential could not be verified.',
  };
}

function GroupHeader({ group }: { group: CreatorIdentityGroup }) {
  const indicator = getValidationIndicator(group.validationStatus);

  return (
    <div className="c2pa-creator-section__group-header">
      <span className="c2pa-creator-section__source">{group.source}</span>
      <span
        className="c2pa-creator-section__status"
        aria-label={`Creator identity status: ${group.validationStatus}`}
        title={indicator.message}
        data-testid="c2pa-creator-status"
        data-validation-state={group.validationStatus}
      >
        {indicator.icon}
      </span>
    </div>
  );
}

export function CreatorSection({
  section,
  title,
  isExpanded,
  onToggle,
}: {
  section: CreatorSectionItem;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();

  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-creator-section">
        <SectionToggle
          title={title}
          isExpanded={isExpanded}
          controls={panelId}
          onToggle={onToggle}
        />
        <div
          id={panelId}
          className={`c2pa-menu-section__content ${isExpanded ? 'expanded' : ''}`}
        >
          <div className="c2pa-menu-section__content-inner c2pa-creator-section__content">
            {section.groups.map((group, groupIndex) => (
              <div key={`${group.source}-${groupIndex}`} className="c2pa-creator-section__group">
                <GroupHeader group={group} />
                {group.claims.map((claim, claimIndex) => (
                  <ClaimRow key={`${claim.type}-${claim.uri ?? claim.displayName ?? claimIndex}`} claim={claim} />
                ))}
                {/* Spelled out rather than left to the icon's tooltip, same
                    reasoning as OrganizationSection's caveat: the point of
                    this section is the names in it, and hovering a glyph to
                    learn nothing vouched for them is not a fair trade. */}
                {group.validationStatus !== 'Trusted' ? (
                  <p className="c2pa-creator-section__caveat">{getValidationIndicator(group.validationStatus).message}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
