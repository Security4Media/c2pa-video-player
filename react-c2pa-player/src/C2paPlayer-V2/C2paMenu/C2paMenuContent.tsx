import { Fragment, useEffect, useState } from 'react';
import { providerInfoFromSocialId } from './Providers.js';

type MenuItems = Record<string, string>;
type MenuValues = Record<string, any>;
type MenuMode = 'ready' | 'loading' | 'no-manifest' | 'invalid';

interface C2paMenuContentProps {
  menuItems: MenuItems;
  items: MenuValues;
  mode: MenuMode;
  resetKey: string;
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

function ValidationStatus({ itemName, itemValue }: { itemName: string; itemValue: string }) {
  if (itemValue === 'Failed') {
    return <span className="itemName nextLine">{itemName}</span>;
  }

  const statusClass = itemValue.toLowerCase();
  return (
    <>
      <span className="itemName">{itemName}</span>{' '}
      <span className={`validation-${statusClass}`}>{itemValue}</span>
    </>
  );
}

function AlertItem({ itemValue }: { itemValue: string }) {
  return (
    <div className="alert-div">
      <img className="alert-icon" />
      <div>{itemValue}</div>
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

function OrganizationItem({ itemName, itemValue }: { itemName: string; itemValue: any }) {
  return (
    <div>
      <div className="itemName">{itemName}</div>
      {itemValue.name ? <div>{itemValue.name}</div> : null}
      {itemValue.website ? (
        <div>
          <span className="itemName">Website:</span> <WebsiteLink href={itemValue.website} />
        </div>
      ) : null}
      {itemValue.identifier ? (
        <div>
          <span className="itemName">Identifier:</span> {itemValue.identifier}
        </div>
      ) : null}
      {itemValue.leiCode ? (
        <div>
          <span className="itemName">LEI:</span> {itemValue.leiCode}
        </div>
      ) : null}
      {itemValue.iso6523Code ? (
        <div>
          <span className="itemName">ISO 6523:</span> {itemValue.iso6523Code}
        </div>
      ) : null}
    </div>
  );
}

function CawgIdentityItem({
  itemName,
  itemValue,
  isExpanded,
  onToggle,
}: {
  itemName: string;
  itemValue: any;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const validationStatus = itemValue.validationStatus;
  const statusClass = validationStatus?.toLowerCase();

  return (
    <>
      <div className="cawg-header" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <span className="itemName">{itemName}</span>
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
            <span className={`validation-${statusClass}`}>{validationStatus}</span>
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
            {itemValue.authors.map((author: any) => author.name).filter(Boolean).join(', ')}
          </div>
        ) : null}
      </div>
    </>
  );
}

function IngredientNode({
  ingredient,
  parentId,
  ingredientsExpanded,
  onToggleIngredient,
}: {
  ingredient: any;
  parentId?: string;
  ingredientsExpanded: Record<string, boolean>;
  onToggleIngredient: (id: string) => void;
}) {
  const ingredientId = parentId ? `${parentId}-ingredient-${ingredient.index}` : `ingredient-${ingredient.index}`;
  const isExpanded = ingredientsExpanded[ingredientId] || false;
  const statusClass = ingredient.validationStatus?.toLowerCase();

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
            <span className={`validation-${statusClass}`}>{ingredient.validationStatus}</span>
          </div>
        ) : null}

        {Array.isArray(ingredient.ingredients) && ingredient.ingredients.length > 0 ? (
          <div className="nested-ingredients">
            <div className="nested-ingredients-header">
              <span className="itemName">Sub-Ingredients:</span>
            </div>
            {ingredient.ingredients.map((nestedIngredient: any) => (
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

function IngredientsItem({
  itemName,
  itemValue,
  ingredientsExpanded,
  onToggleIngredient,
}: {
  itemName: string;
  itemValue: any[];
  ingredientsExpanded: Record<string, boolean>;
  onToggleIngredient: (id: string) => void;
}) {
  return (
    <div className="ingredients-container">
      <div className="ingredients-main-header">
        <span className="itemName">{itemName}</span>
      </div>
      {itemValue.map((ingredient: any) => (
        <IngredientNode
          key={`ingredient-${ingredient.index}`}
          ingredient={ingredient}
          ingredientsExpanded={ingredientsExpanded}
          onToggleIngredient={onToggleIngredient}
        />
      ))}
    </div>
  );
}

function SocialItem({ itemName, itemValue }: { itemName: string; itemValue: string[] }) {
  return (
    <>
      <span className="itemName">{itemName}</span>{' '}
      {itemValue.map(account => {
        const formattedWebsite = providerInfoFromSocialId(account)?.name ?? account;
        return (
          <Fragment key={account}>
            <span>
              <a className="url" href={account} target="_blank" rel="noreferrer">
                {formattedWebsite}
              </a>
            </span>{' '}
          </Fragment>
        );
      })}
    </>
  );
}

function DefaultItem({ itemName, itemValue }: { itemName: string; itemValue: string }) {
  if (itemValue.length >= 23) {
    return (
      <>
        <div className="itemName">{itemName}</div> {itemValue}
      </>
    );
  }

  return (
    <>
      <span className="itemName">{itemName}</span> {itemValue}
    </>
  );
}

function renderMenuItem(
  itemKey: string,
  itemName: string,
  itemValue: any,
  cawgIdentityExpanded: boolean,
  ingredientsExpanded: Record<string, boolean>,
  onToggleCawg: () => void,
  onToggleIngredient: (id: string) => void,
) {
  if (itemValue == null) {
    return null;
  }

  if (itemKey === 'ALERT') {
    return <AlertItem itemValue={itemValue} />;
  }

  if (itemKey === 'C2PA_VALIDATION_STATUS') {
    return <ValidationStatus itemName={itemName} itemValue={itemValue} />;
  }

  if (itemKey === 'CAWG_IDENTITY' && typeof itemValue === 'object') {
    return (
        <CawgIdentityItem
          itemName={itemName}
          itemValue={itemValue}
          isExpanded={cawgIdentityExpanded}
          onToggle={onToggleCawg}
        />
      );
  }

  if (itemKey === 'INGREDIENTS' && Array.isArray(itemValue)) {
    return (
        <IngredientsItem
          itemName={itemName}
          itemValue={itemValue}
          ingredientsExpanded={ingredientsExpanded}
          onToggleIngredient={onToggleIngredient}
        />
      );
  }

  if (itemKey === 'ORGANIZATION' && typeof itemValue === 'object') {
    return <OrganizationItem itemName={itemName} itemValue={itemValue} />;
  }

  if (itemKey === 'WEBSITE' && typeof itemValue === 'string') {
    return (
      <>
        <div className="itemName">{itemName}</div> <WebsiteLink href={itemValue} />
      </>
    );
  }

  if (itemKey === 'SOCIAL' && Array.isArray(itemValue)) {
    return <SocialItem itemName={itemName} itemValue={itemValue} />;
  }

  if (typeof itemValue === 'string') {
    return <DefaultItem itemName={itemName} itemValue={itemValue} />;
  }

  return null;
}

export function C2paMenuContent({
  menuItems,
  items,
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
    return <LoadingState />;
  }

  if (mode === 'no-manifest') {
    return <NoManifestState />;
  }

  if (mode === 'invalid') {
    return <InvalidState />;
  }

  return (
    <>
      {Object.entries(menuItems).map(([itemKey, itemName]) => {
        const content = renderMenuItem(
          itemKey,
          itemName,
          items[itemKey] ?? null,
          cawgIdentityExpanded,
          ingredientsExpanded,
          handleToggleCawg,
          handleToggleIngredient,
        );

        if (!content) {
          return null;
        }

        return (
          <li key={itemKey} className="vjs-menu-item">
            {content}
          </li>
        );
      })}
    </>
  );
}
