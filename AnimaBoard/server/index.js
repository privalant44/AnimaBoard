const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadRootEnv } = require('../scripts/loadRootEnv');
loadRootEnv();
require('../lib/secretEnv');

const app = express();
const PORT = process.env.PORT || 3000;
const { requireAuthMiddleware } = require('../lib/requireAuth');
const { isAuthEnabled } = require('../lib/microsoftAuth');

// Middleware
app.use(cors());
app.use(express.json());

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Anima Board API is running', auth: isAuthEnabled() });
});

// Variables d'environnement (public — utilisé par le client avant connexion)
app.get('/api/env-check', require('../api/env-check'));

// Routes API en premier (avant le static / SPA) pour ne jamais renvoyer index.html sur /api/*
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);

  app.use(requireAuthMiddleware);

  const boondManagerRoutes = require('./routes/boondManager');
  const pennylaneRoutes = require('./routes/pennylane');
  const dashboardRoutes = require('./routes/dashboard');
  const testRoutes = require('./routes/test');
  const dataRoutes = require('./routes/data');
  const kvStorage = require('../lib/kvStorage');
  const { KV_KEYS } = require('../lib/constants');

  app.use('/api/boondmanager', boondManagerRoutes);
  app.use('/api/pennylane', pennylaneRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/test', testRoutes);
  app.use('/api/data', dataRoutes);

  // POST /api/timesheets-reset : vide KV puis recharge périodes n-1 et n
  app.post('/api/timesheets-reset', async (req, res) => {
    try {
      await kvStorage.del(KV_KEYS.TIMESHEETS_DATA);
      await kvStorage.del(KV_KEYS.TIMESHEETS_AGGREGATE);
      const currentYear = new Date().getFullYear();
      const startMonth = `${currentYear - 1}-01`;
      const endMonth = `${currentYear}-12`;
      const syncTimesheets = require('../sync_timesheets');
      const result = await syncTimesheets(startMonth, endMonth);
      const count = result?.metadata?.totalTimesheets ?? 0;
      const totalEntries = result?.metadata?.totalEntries ?? 0;
      return res.json({
        success: true,
        message: `Feuilles de temps réinitialisées et rechargées (${startMonth} à ${endMonth}) : ${count} feuilles, ${totalEntries} entrées.`
      });
    } catch (error) {
      console.error('❌ Erreur /api/timesheets-reset:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('✅ Routes chargées avec succès');
} catch (error) {
  console.error('❌ Erreur lors du chargement des routes:', error);
  process.exit(1);
}

// En dev : indiquer où ouvrir le client (React tourne sur un autre port)
if (process.env.NODE_ENV !== 'production') {
  const clientPort = process.env.CLIENT_PORT || 3001;
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Anima Board</title></head>
      <body style="font-family:sans-serif;padding:2rem;">
        <h1>Anima Board – API</h1>
        <p>Le serveur API tourne sur le port ${PORT}.</p>
        <p>Ouvrez l’interface : <a href="http://localhost:${clientPort}">http://localhost:${clientPort}</a></p>
        <p><a href="/api/health">Health check</a></p>
      </body></html>
    `);
  });
}

// Static React + fallback SPA (production uniquement, après les routes /api)
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ success: false, error: 'Route API introuvable' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Gestion d'erreur globale
app.use((err, req, res, next) => {
  console.error('❌ Erreur non gérée:', err);
  res.status(500).json({ 
    error: 'Erreur interne du serveur',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.listen(PORT, (err) => {
  if (err) {
    console.error('❌ Erreur lors du démarrage du serveur:', err);
    process.exit(1);
  }
  console.log(`🚀 Server running on port ${PORT}`);
});
