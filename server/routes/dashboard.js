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

// Compte de résultat mensuel (Pennylane v2 : ledger_entries, comptes 6 et 7)
router.get('/income-statement', async (req, res) => {
  try {
    const year = req.query.year != null ? req.query.year : undefined;
    const data = await dashboardService.getPennylaneIncomeStatement(year);
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur income-statement:', error);
    res.status(500).json({ error: error.message });
  }
});

// Force une synchronisation Pennylane du compte de résultat pour l'année demandée.
router.post('/income-statement/sync', async (req, res) => {
  try {
    const data = await dashboardService.syncPennylaneIncomeStatement();
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur income-statement sync:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialisation ciblée de la table compte de résultat (ex: 2025 + 2026).
router.post('/income-statement/init', async (req, res) => {
  try {
    const years = Array.isArray(req.body?.years) && req.body.years.length > 0
      ? req.body.years
      : [2025, 2026];
    const result = await dashboardService.syncPennylaneIncomeStatementYears(years);
    res.json({ ok: true, years: result });
  } catch (error) {
    console.error('❌ Erreur income-statement init:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récap principal mensuel (année en cours par défaut)
router.get('/home-monthly-recap', async (req, res) => {
  try {
    const year = req.query.year != null ? req.query.year : undefined;
    const data = await dashboardService.getHomeMonthlyRecap(year);
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur home-monthly-recap:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
