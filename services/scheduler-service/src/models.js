function getModels(options = {}) {
  if (options.models) {
    return options.models;
  }
  return require('@jobflow/shared/models');
}

module.exports = { getModels };
