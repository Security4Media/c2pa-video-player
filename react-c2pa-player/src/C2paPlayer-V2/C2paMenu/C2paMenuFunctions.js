/**
 * Backward-compatible facade for the C2PA menu module.
 * Video.js shell helpers are re-exported from `C2paMenuShell.js` and
 * React bridge lifecycle helpers are re-exported from `C2paMenuBridge.js`.
 */
export { initializeC2PAMenu, adjustC2PAMenu } from './C2paMenuShell.js';
export {
  disposeC2PAMenu,
  registerMenuItemRenderer,
  resetC2PAMenuCache,
  updateC2PAMenu,
} from './C2paMenuBridge.js';
