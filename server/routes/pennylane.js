const express = require('express');
const router = express.Router();
const pennylaneService = require('../services/pennylaneService');

// GET /api/pennylane/test — vérifie le token (GET /me)
router.get('/test', async (req, res) => {
  try {
    const result = await pennylaneService.probeApi();
    res.json({ ok: true, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/pennylane/compte-de-resultat?year=2025
// Compte de résultat mensuel (classes 6 / 7) : par défaut GET /ledger_entry_lines, sinon PENNYLANE_PL_SOURCE=ledger_entries
router.get('/compte-de-resultat', async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const result = await pennylaneService.getCompteDeResultat(year);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pennylane/ledger-entry-lines?startDate=2025-01-01&endDate=2025-01-31
// Lignes d'écritures (index /ledger_entry_lines), dédupliquées par id — même principe qu'un export PowerShell
router.get('/ledger-entry-lines', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Paramètres startDate et endDate requis (YYYY-MM-DD)' });
    }
    const lines = await pennylaneService.fetchAllLedgerEntryLinesInRange(startDate, endDate);
    res.json({ ledger_entry_lines: lines, count: lines.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pennylane/ledger-entries?startDate=2025-01-01&endDate=2025-01-31
// Retourne les écritures comptables brutes sur une période
router.get('/ledger-entries', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Paramètres startDate et endDate requis (YYYY-MM-DD)' });
    }
    const result = await pennylaneService.fetchAllLedgerEntries(startDate, endDate);
    res.json({ ledger_entries: result, count: result.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pennylane/debug-month?year=2025&month=1[&all=1][&aggregate=1]
// Export ligne-par-ligne d'un mois. Sans aggregate=1 : pas d'agrégation P&L (byAccount, totaux).
router.get('/debug-month', async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month) {
      return res.status(400).json({ error: 'Paramètres year et month requis' });
    }
    const includeAllAccounts = req.query.all === '1';
    const includeAggregation = req.query.aggregate === '1' || req.query.summary === '1';
    const result = await pennylaneService.debugExportLedgerMonth(year, month, {
      includeAllAccounts,
      includeAggregation,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;