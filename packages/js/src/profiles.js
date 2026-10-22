// Granular entrypoint factories. Selection is build/deploy time; the runtime
// itself only ever verifies the composition it was given.
import { createValiCore, ValiCoreError } from './index.js';

function fail(code, message, field) { throw new ValiCoreError(code, message, field); }

export function profileFactory(profile) {
  if (typeof profile !== 'string' || !profile) fail('INVALID_ARGUMENT', 'A profile name is required');
  return (options = {}) => {
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_ARGUMENT', 'Initialization options must be an object');
    if (options.profile !== undefined && options.profile !== profile)
      fail('INVALID_ARGUMENT', `This entrypoint is bound to the ${profile} profile`);
    return createValiCore({ ...options, profile });
  };
}
