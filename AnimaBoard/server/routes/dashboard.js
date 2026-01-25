const express = require('express');
const router = express.Router();
const dashboardService = require('../services/dashboardService');

// Récupérer toutes les métriques du tableau de bord
router.get('/metrics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    console.log('📊 Récupération des métriques du tableau de bord...');
    const metrics = await dashboardService.getDashboardMetrics(startDate, endDate);
    
    // Vérifier que les métriques sont valides
    if (!metrics || !metrics.monthly || !metrics.totals) {
      throw new Error('Les métriques retournées sont invalides');
    }
    
    console.log('✅ Métriques récupérées avec succès');
    res.json(metrics);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des métriques:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Récupérer le CA par mois
router.get('/revenue-by-month', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const revenue = await dashboardService.getRevenueByMonth(startDate, endDate);
    res.json(revenue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
