import { useEffect, useState, type ReactNode } from 'react';
import type {
  C2paMenuMode,
  C2paMenuSections,
  SummarySectionItem,
} from './menuViewModel';
import {
  AiOptOutSectionItem,
  CawgOrganizationItem,
  ClaimGeneratorSectionItem,
  HistorySectionItem,
  IngredientDisplayItem,
  OrganizationIdentityItem,
  OrganizationSectionItem,
  WorkSectionItem,
} from './models';

interface C2paMenuContentProps {
  sectionTitles: Record<string, string>;
  sections: C2paMenuSections | null;
  mode: C2paMenuMode;
  resetKey: string;
}

function MenuTitle() {
  return (
    <li className="vjs-menu-title c2pa-react-menu-title">
      Content Credentials
    </li>
  );
}

function LoadingState() {
  return (
    <li className="vjs-menu-item">
      <div
        className="alert-div"
        style={{ backgroundColor: 'rgba(14, 65, 148, 0.2)', borderColor: 'rgba(255, 255, 255, 0.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              border: '3px solid rgba(255, 255, 255, 0.3)',
              borderTopColor: 'rgba(125, 180, 255, 1)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <div>
            <strong>Loading Content Credentials...</strong>
            <br />
            Please wait while we fetch the manifest information.
          </div>
        </div>
      </div>
    </li>
  );
}

function NoManifestState() {
  return (
    <li className="vjs-menu-item">
      <div
        className="alert-div"
        style={{ backgroundColor: 'rgba(14, 65, 148, 0.2)', borderColor: 'rgba(255, 255, 255, 0.3)' }}
      >
        <div>
          <strong>Warning: No Content Credentials Found</strong>
          <br />
          This video does not contain Content Credentials information.
        </div>
      </div>
    </li>
  );
}

function InvalidState() {
  return (
    <li className="vjs-menu-item validation-padding">
      <div className="alert-div">
        <div>
          <strong>Content Credentials are Invalid</strong>
          <br />
          The content credentials for this video could not be verified
          <br />
          and may have been tampered with.
        </div>
      </div>
    </li>
  );
}

function MenuField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: ReactNode;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <div>
        <div className="itemName">{label}</div> {value}
      </div>
    );
  }

  return (
    <div>
      <span className="itemName">{label}</span> {value}
    </div>
  );
}

function WebsiteLink({ href }: { href: string }) {
  return (
    <a className="url" href={href} target="_blank" rel="noreferrer">
      {href}
    </a>
  );
}

function ValidationBadge({ value }: { value: string }) {
  return <span className={`validation-${value.toLowerCase()}`}>{value}</span>;
}

function AlertItem({ itemValue }: { itemValue: string }) {
  return (
    <li className="vjs-menu-item">
      <div className="alert-div">
        <img className="alert-icon" />
        <div>{itemValue}</div>
      </div>
    </li>
  );
}

function SummarySection({
  section,
  sectionTitles,
}: {
  section: SummarySectionItem;
  sectionTitles: Record<string, string>;
}) {
  return (
    <>
      {section.issuer ? (
        <li className="vjs-menu-item">
          <MenuField label={sectionTitles.summaryIssuer} value={section.issuer} />
        </li>
      ) : null}
      {section.issuedOn ? (
        <li className="vjs-menu-item">
          <MenuField label={sectionTitles.summaryDate} value={section.issuedOn} />
        </li>
      ) : null}
      {section.validationStatus ? (
        <li className="vjs-menu-item">
          <MenuField
            label={sectionTitles.validationStatus}
            value={<ValidationBadge value={section.validationStatus} />}
          />
        </li>
      ) : null}
      {section.alert ? <AlertItem itemValue={section.alert} /> : null}
    </>
  );
}

function ClaimGeneratorSection({
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

function OrganizationSection({
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

function WorkSection({
  section,
  title,
}: {
  section: WorkSectionItem;
  title: string;
}) {
  return (
    <li className="vjs-menu-item">
      <div>
        <div className="itemName">{title}</div>
        {section.role ? (
          <div>
            <span className="itemName">Role:</span> {section.role}
          </div>
        ) : null}
        {section.authors.map((author, index) => (
          <div key={`${author.identifier ?? author.email ?? author.name ?? 'author'}-${index}`} style={{ marginTop: '8px' }}>
            {author.name ? (
              <div>
                <span className="itemName">Author:</span> {author.name}
              </div>
            ) : null}
            {author.skill ? (
              <div>
                <span className="itemName">Role:</span> {author.skill}
              </div>
            ) : null}
            {author.email ? (
              <div>
                <span className="itemName">Email:</span> {author.email}
              </div>
            ) : null}
            {author.department ? (
              <div>
                <span className="itemName">Department:</span> {author.department}
              </div>
            ) : null}
            {author.identifier ? (
              <div>
                <span className="itemName">Identifier:</span> {author.identifier}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </li>
  );
}

function AiOptOutSection({
  section,
  title,
}: {
  section: AiOptOutSectionItem;
  title: string;
}) {
  return (
    <li className="vjs-menu-item">
      <div>
        <div className="itemName">{title}</div>
        {section.assertions.map(assertion => (
          <div key={assertion.label} style={{ marginTop: '8px' }}>
            <div>
              <span className="itemName">Assertion:</span> {assertion.label}
            </div>
            {assertion.entries.map(entry => (
              <div key={`${assertion.label}-${entry.key}`}>
                <span className="itemName">{entry.key}:</span> {entry.use ?? 'Unknown'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </li>
  );
}

function IngredientNode({
  ingredient,
  parentId,
  ingredientsExpanded,
  onToggleIngredient,
}: {
  ingredient: IngredientDisplayItem;
  parentId?: string;
  ingredientsExpanded: Record<string, boolean>;
  onToggleIngredient: (id: string) => void;
}) {
  const ingredientId = parentId ? `${parentId}-ingredient-${ingredient.index}` : `ingredient-${ingredient.index}`;
  const isExpanded = ingredientsExpanded[ingredientId] || false;

  return (
    <div className="ingredient-item">
      <div
        className="ingredient-header"
        data-id={ingredientId}
        style={{ cursor: 'pointer' }}
        onClick={() => onToggleIngredient(ingredientId)}
      >
        <span className="itemName">Ingredient {ingredient.index}</span>
        {ingredient.ingredientCount && ingredient.ingredientCount > 0 ? (
          <span className="ingredient-count">
            ({ingredient.ingredientCount} ingredient{ingredient.ingredientCount > 1 ? 's' : ''})
          </span>
        ) : null}
        <span className={`ingredient-toggle ${isExpanded ? 'expanded' : ''}`}>›</span>
      </div>

      <div id={ingredientId} className="ingredient-content" style={{ display: isExpanded ? 'flex' : 'none' }}>
        {ingredient.title ? (
          <div>
            <span className="itemName">Title:</span> {ingredient.title}
          </div>
        ) : null}
        {ingredient.issuer ? (
          <div>
            <span className="itemName">Issued by:</span> {ingredient.issuer}
          </div>
        ) : null}
        {ingredient.claimGenerator ? (
          <div>
            <span className="itemName">App or device:</span> {ingredient.claimGenerator}
          </div>
        ) : null}
        {ingredient.date ? (
          <div>
            <span className="itemName">Issued on:</span> {ingredient.date}
          </div>
        ) : null}
        {ingredient.validationStatus ? (
          <div>
            <span className="itemName">Validation Status:</span>{' '}
            <ValidationBadge value={ingredient.validationStatus} />
          </div>
        ) : null}
        {Array.isArray(ingredient.ingredients) && ingredient.ingredients.length > 0 ? (
          <div className="nested-ingredients">
            <div className="nested-ingredients-header">
              <span className="itemName">Sub-Ingredients:</span>
            </div>
            {ingredient.ingredients.map((nestedIngredient) => (
              <IngredientNode
                key={`${ingredientId}-${nestedIngredient.index}`}
                ingredient={nestedIngredient}
                parentId={ingredientId}
                ingredientsExpanded={ingredientsExpanded}
                onToggleIngredient={onToggleIngredient}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HistorySection({
  section,
  title,
  ingredientsExpanded,
  onToggleIngredient,
}: {
  section: HistorySectionItem;
  title: string;
  ingredientsExpanded: Record<string, boolean>;
  onToggleIngredient: (id: string) => void;
}) {
  return (
    <li className="vjs-menu-item">
      <div className="ingredients-container">
        <div className="ingredients-main-header">
          <span className="itemName">{title}</span>
        </div>
        {section.ingredients.map((ingredient) => (
          <IngredientNode
            key={`ingredient-${ingredient.index}`}
            ingredient={ingredient}
            ingredientsExpanded={ingredientsExpanded}
            onToggleIngredient={onToggleIngredient}
          />
        ))}
      </div>
    </li>
  );
}

/**
 * Presentational menu body component. It receives already-derived menu
 * state and manages only local UI interactions such as expanding and
 * collapsing CAWG and ingredient sections.
 */
export function C2paMenuContent({
  sectionTitles,
  sections,
  mode,
  resetKey,
}: C2paMenuContentProps) {
  const [cawgIdentityExpanded, setCawgIdentityExpanded] = useState(false);
  const [ingredientsExpanded, setIngredientsExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCawgIdentityExpanded(false);
    setIngredientsExpanded({});
  }, [resetKey]);

  const handleToggleCawg = () => {
    setCawgIdentityExpanded(current => !current);
  };

  const handleToggleIngredient = (ingredientId: string) => {
    setIngredientsExpanded(current => ({
      ...current,
      [ingredientId]: !current[ingredientId],
    }));
  };

  if (mode === 'loading') {
    return (
      <>
        <MenuTitle />
        <LoadingState />
      </>
    );
  }

  if (mode === 'no-manifest') {
    return (
      <>
        <MenuTitle />
        <NoManifestState />
      </>
    );
  }

  if (mode === 'invalid') {
    return (
      <>
        <MenuTitle />
        <InvalidState />
      </>
    );
  }

  if (!sections) {
    return <MenuTitle />;
  }

  return (
    <>
      <MenuTitle />
      <SummarySection section={sections.summary} sectionTitles={sectionTitles} />
      {sections.claimGenerator ? (
        <ClaimGeneratorSection
          section={sections.claimGenerator}
          title={sectionTitles.claimGenerator}
        />
      ) : null}
      {sections.organization ? (
        <OrganizationSection
          section={sections.organization}
          title={sectionTitles.organization}
          isExpanded={cawgIdentityExpanded}
          onToggleCawg={handleToggleCawg}
        />
      ) : null}
      {sections.work ? (
        <WorkSection
          section={sections.work}
          title={sectionTitles.work}
        />
      ) : null}
      {sections.aiOptOut ? (
        <AiOptOutSection
          section={sections.aiOptOut}
          title={sectionTitles.aiOptOut}
        />
      ) : null}
      {sections.history ? (
        <HistorySection
          section={sections.history}
          title={sectionTitles.history}
          ingredientsExpanded={ingredientsExpanded}
          onToggleIngredient={handleToggleIngredient}
        />
      ) : null}
    </>
  );
}
