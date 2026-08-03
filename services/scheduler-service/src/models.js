function getModels(options = {}) {
  if (options.models) {
    return options.models;
  }
  try {
    return require('../../../../services/api-service/src/models');
  } catch (err) {
    try {
      return require('../../../api-service/src/models');
    } catch {
      const mongoose = require('mongoose');
      return {
        Job: mongoose.model('Job'),
        
        Execution: mongoose.model('Execution'),
      };
    }
  }
}

module.exports = { getModels };