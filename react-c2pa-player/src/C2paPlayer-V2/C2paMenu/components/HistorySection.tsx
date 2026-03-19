import type { HistorySectionItem, IngredientDisplayItem } from '../models';
import { ValidationBadge } from './shared';

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
    <div className="c2pa-history-section__ingredient">
        <div
          className="c2pa-history-section__ingredient-header"
          data-id={ingredientId}
          onClick={() => onToggleIngredient(ingredientId)}
        >
        <span className="itemName">Ingredient {ingredient.index}</span>
        {ingredient.ingredientCount && ingredient.ingredientCount > 0 ? (
          <span className="c2pa-history-section__ingredient-count">
            ({ingredient.ingredientCount} ingredient{ingredient.ingredientCount > 1 ? 's' : ''})
          </span>
        ) : null}
        <span className={`c2pa-history-section__ingredient-toggle ${isExpanded ? 'expanded' : ''}`}>›</span>
      </div>

      <div id={ingredientId} className={`c2pa-history-section__ingredient-panel ${isExpanded ? 'expanded' : ''}`}>
        <div className="c2pa-history-section__ingredient-panel-inner">
          <div className="c2pa-history-section__ingredient-content">
            {ingredient.title ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Title:</span> {ingredient.title}
              </div>
            ) : null}
            {ingredient.issuer ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Issued by:</span> {ingredient.issuer}
              </div>
            ) : null}
            {ingredient.claimGenerator ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">App or device:</span> {ingredient.claimGenerator}
              </div>
            ) : null}
            {ingredient.date ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Issued on:</span> {ingredient.date}
              </div>
            ) : null}
            {ingredient.validationStatus ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Validation Status:</span>{' '}
                <ValidationBadge value={ingredient.validationStatus} />
              </div>
            ) : null}
            {Array.isArray(ingredient.ingredients) && ingredient.ingredients.length > 0 ? (
              <div className="c2pa-history-section__subingredients">
                <div className="c2pa-history-section__subingredients-header">
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
      </div>
    </div>
  );
}

export function HistorySection({
  title,
  onOpen,
}: {
  title: string;
  onOpen: () => void;
}) {
  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-history-section">
        <div className="c2pa-menu-section__header c2pa-menu-section__header--collapsible" onClick={onOpen}>
          <span className="itemName c2pa-menu-section__title">{title}</span>
          <span className="c2pa-menu-section__toggle">›</span>
        </div>
      </div>
    </li>
  );
}

export function HistoryDetailView({
  section,
  title,
  onBack,
  ingredientsExpanded,
  onToggleIngredient,
}: {
  section: HistorySectionItem;
  title: string;
  onBack: () => void;
  ingredientsExpanded: Record<string, boolean>;
  onToggleIngredient: (id: string) => void;
}) {
  return (
    <>
      <li className="vjs-menu-item c2pa-history-section__view-nav">
        <button className="c2pa-history-section__back-button" type="button" onClick={onBack}>
          <span className="c2pa-history-section__back-icon">‹</span>
          <span>Back</span>
        </button>
      </li>
      <li className="vjs-menu-item c2pa-history-section__view-title-row">
        <div className="c2pa-menu-section c2pa-history-section">
          <div className="c2pa-menu-section__header">
            <span className="itemName c2pa-menu-section__title">{title}</span>
          </div>
          <div className="c2pa-history-section__content c2pa-history-section__content--detail">
            {section.ingredients.map((ingredient) => (
              <IngredientNode
                key={`ingredient-${ingredient.index}`}
                ingredient={ingredient}
                ingredientsExpanded={ingredientsExpanded}
                onToggleIngredient={onToggleIngredient}
              />
            ))}
          </div>
        </div>
      </li>
    </>
  );
}
