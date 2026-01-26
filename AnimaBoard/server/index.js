const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir les fichiers statiques du client en production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
  app.use(express.static(clientBuildPath));
}

// Routes avec gestion d'erreur
try {
  const boondManagerRoutes = require('./routes/boondManager');
  const pennylaneRoutes = require('./routes/pennylane');
  const dashboardRoutes = require('./routes/dashboard');
  const testRoutes = require('./routes/test');
  const dataRoutes = require('./routes/data');

  app.use('/api/boondmanager', boondManagerRoutes);
  app.use('/api/pennylane', pennylaneRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/test', testRoutes);
  app.use('/api/data', dataRoutes);

  console.log('✅ Routes chargées avec succès');
} catch (error) {
  console.error('❌ Erreur lors du chargement des routes:', error);
  process.exit(1);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Anima Board API is running' });
});

// Servir l'application React pour toutes les routes non-API en production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
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
