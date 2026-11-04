// Deployment settings. Fill CLOUD_ENV after creating a Cloud Development environment.
module.exports = {
  // Cloud Development environment id, e.g. 'buxulu-3g2f8a'. Empty means "not deployed yet".
  CLOUD_ENV: '',

  // 'auto'  : cloud when CLOUD_ENV is set, otherwise simulated steps for local development.
  // 'cloud' : always use the cloud function.
  // 'mock'  : always simulate. Never active in a release build (see systems/steps.js).
  STEP_BACKEND: 'auto',

  VERSION: '1.0.0',
};
