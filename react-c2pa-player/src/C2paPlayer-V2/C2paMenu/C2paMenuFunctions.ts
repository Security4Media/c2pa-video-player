/**
 * Facade for the C2PA menu module.
 * Video.js shell helpers are re-exported from `C2paMenuShell` and
 * React bridge lifecycle helpers are re-exported from `C2paMenuBridge`.
 */
export { initializeC2PAMenu } from './C2paMenuShell';
export {
    disposeC2PAMenu,
    setPlayerRootController,
    updateC2PAMenu,
} from './C2paMenuBridge';
