const express = require('express');
const router = express.Router();
const boondManagerService = require('../services/boondManagerService');
const pennylaneService = require('../services/pennylaneService');

// Page de test de configuration des API
router.get('/', async (req, res) => {
  const config = {
    boondManager: {
      url: process.env.BOONDMANAGER_API_URL || 'Non configuré',
      hasKey: !!process.env.BOONDMANAGER_API_KEY,
      hasSecret: !!process.env.BOONDMANAGER_API_SECRET,
      status: 'unknown'
    },
    pennylane: {
      url: process.env.PENNYLANE_API_URL || 'Non configuré',
      hasKey: !!process.env.PENNYLANE_API_KEY,
      status: 'unknown'
    }
  };

  // Tester BoondManager
  try {
    await boondManagerService.getResources();
    config.boondManager.status = 'connected';
  } catch (error) {
    config.boondManager.status = 'error';
    config.boondManager.error = error.message;
  }

  // Tester Pennylane
  try {
    await pennylaneService.getInvoices();
    config.pennylane.status = 'connected';
  } catch (error) {
    config.pennylane.status = 'error';
    config.pennylane.error = error.message;
  }

  res.json({
    message: 'État de la configuration des API',
    config,
    instructions: {
      boondManager: 'Configurez BOONDMANAGER_API_KEY et BOONDMANAGER_API_SECRET dans le fichier .env',
      pennylane: 'Configurez PENNYLANE_API_KEY dans le fichier .env'
    }
  });
});

module.exports = router;
