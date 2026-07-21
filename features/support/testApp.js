const express = require('express');
const path = require('path');
const { buildRolePreview } = require('../../lib/rolePermissions');

let server = null;
let currentAuthPayload = {
  success: true,
  authEnabled: true,
  email: 'test@animaneo.fr',
  displayName: 'Test User',
  role: 'commercial',
  roleLabel: 'Commercial',
  permissions: [],
};

function setMockAuth(payload) {
  currentAuthPayload = {
    success: true,
    authEnabled: true,
    displayName: 'Test User',
    ...payload,
  };
}

async function startTestApp() {
  const app = express();
  const buildDir = path.join(__dirname, '..', '..', 'client', 'build');

  app.get('/api/env-check', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (_req, res) => {
    res.json(currentAuthPayload);
  });

  app.get('/api/auth/role-permissions/:role/preview', async (req, res) => {
    try {
      const preview = await buildRolePreview(req.params.role);
      res.json({ success: true, ...preview });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Aperçu impossible' });
    }
  });

  app.get('/api/dashboard/home-monthly-recap', (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      return {
        month: `${year}-${month}`,
        caAnimaNeo: 80000 + index * 5000,
        caSousTraitance: 10000 + index * 500,
        margeBruteAnimaNeo: 20000 + index * 1000,
        margeBruteSousTraitance: 1500 + index * 100,
        resultat: 12000 + index * 800,
        tacePct: 72 + index * 0.5,
        taceIsClosedMonth: index < 6,
        besoinsCrees: 3 + (index % 4),
        besoinsStock: 5 + (index % 3),
        besoinsGagnes: 2 + (index % 2),
        besoinsPerdus: 1,
        besoinsAbandonnes: index % 2,
        besoinsStandBy: 1 + (index % 2),
        delaiMoyenReponseDays: 4 + index * 0.2,
        delaiMoyenReponseCount: 2 + index,
      };
    });
    res.json({ year, monthly });
  });

  app.get('/api/dashboard/treasury-plan', (_req, res) => {
    res.json({ monthly: [], settings: { averagePaymentDelayDays: 30, initialBalance: 0 } });
  });

  app.get('/api/company-logo', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.get('/api/data/forecast-bootstrap', (_req, res) => {
    res.json({
      success: true,
      data: {
        resourcesLocal: [
          {
            id: 42,
            nom: 'Dupont',
            prenom: 'Jean',
            typeLabel: 'Consultant',
            stateLabel: 'En mission',
            raw: { email: 'manager@animaneo.fr' },
          },
        ],
        dictionaryOptions: { types: ['Consultant'], states: ['En mission'] },
        deliveries: [
          {
            id: '1001',
            resourceId: 42,
            title: 'Mission test',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            tjm: 500,
          },
        ],
        forecastByDeliveryId: {},
        orderedDaysByDeliveryId: {},
        timesheetsAggregate: {},
        absenceByResource: {},
        plannedDeliveriesByResource: {},
        forecastScenarios: [],
        holidays: [],
      },
    });
  });

  app.get('/api/data/resources-local', (_req, res) => {
    res.json({
      success: true,
      data: [
        {
          id: 42,
          nom: 'Dupont',
          prenom: 'Jean',
          type: 'Consultant',
          statut: 'En mission',
        },
      ],
    });
  });

  app.get('/api/data/resources-metadata', (_req, res) => {
    res.json({ success: true, data: {} });
  });

  app.get('/api/dashboard/income-statement', (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    res.json({
      year,
      source: 'bdd',
      method: 'test',
      description: 'Mock BDD',
      monthly: [],
      totals: {
        produits: 0,
        charges: 0,
        resultat: 0,
        caAnimaNeo: 0,
        caSousTraitance: 0,
        salaires: 0,
        cotisationsSociales: 0,
        autresCharges: 0,
        dontSousTraitance: 0,
      },
      counts: { months: 0 },
    });
  });

  app.post('/api/boondmanager/sync/besoins/snapshot', (_req, res) => {
    res.json({ success: true, message: 'Mock snapshot' });
  });

  app.get('/api/batch-sync/status', (_req, res) => {
    res.json({ success: true, lastRun: null });
  });

  app.get('/api/data/french-holidays.json', (_req, res) => {
    res.json([]);
  });

  app.use(express.static(buildDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'));
  });

  const port = 3099;
  await new Promise((resolve) => {
    server = app.listen(port, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${port}`;
}

async function stopTestApp() {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  server = null;
}

module.exports = {
  startTestApp,
  stopTestApp,
  setMockAuth,
};
