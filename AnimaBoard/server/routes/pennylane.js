const express = require('express');
const router = express.Router();
const pennylaneService = require('../services/pennylaneService');

// Récupérer les factures
router.get('/invoices', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const invoices = await pennylaneService.getInvoices(startDate, endDate);
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les charges
router.get('/expenses', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const expenses = await pennylaneService.getExpenses(startDate, endDate);
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les salaires
router.get('/salaries', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const salaries = await pennylaneService.getSalaries(startDate, endDate);
    res.json(salaries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
