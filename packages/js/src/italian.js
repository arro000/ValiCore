// Granular entrypoint: selects exactly the 'italian' precompiled composition.
import { profileFactory } from './profiles.js';
export { ValiCoreEngine, ValiCoreError, DEFAULT_CHANNEL_URL } from './index.js';
export const createValiCore = profileFactory('italian');
