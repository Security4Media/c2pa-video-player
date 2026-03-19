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

export function HistorySection({
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
