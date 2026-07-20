const express = require('express');
const path = require('path');

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

  app.get('/api/dashboard/home-monthly-recap', (_req, res) => {
    res.json({
      year: new Date().getFullYear(),
      monthly: [
        {
          month: '2026-01',
          caAnimaNeo: 1000,
          caSousTraitance: 0,
          margeBruteAnimaNeo: 200,
          margeBruteSousTraitance: 0,
          resultat: 100,
          tacePct: 80,
          besoinsCrees: 1,
          besoinsStock: 2,
          besoinsGagnes: 0,
          besoinsPerdus: 0,
          besoinsAbandonnes: 0,
          besoinsStandBy: 0,
          delaiMoyenReponseDays: 1,
        },
      ],
    });
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
            raw: { email: 'consultant@animaneo.fr' },
          },
          {
            id: 99,
            nom: 'Martin',
            prenom: 'Paul',
            typeLabel: 'Consultant',
            stateLabel: 'En mission',
            raw: { email: 'autre@animaneo.fr' },
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
          {
            id: '1002',
            resourceId: 99,
            title: 'Mission autre',
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
