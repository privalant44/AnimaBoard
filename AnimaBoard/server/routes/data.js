const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');

// Récupérer le fichier projects.json
router.get('/projects', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'projects.json');
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    res.json({
      success: true,
      file: 'projects.json',
      data: jsonData,
      count: Array.isArray(jsonData) ? jsonData.length : 0
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: 'Fichier projects.json non trouvé. Exécutez sync.js pour créer ce fichier.',
        file: 'projects.json'
      });
    } else {
      console.error('❌ Erreur lors de la lecture de projects.json:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        file: 'projects.json'
      });
    }
  }
});

// Récupérer le fichier resources.json
const handleResourcesRequest = async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'resources.json');
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    res.json({
      success: true,
      file: 'resources.json',
      data: jsonData,
      count: Array.isArray(jsonData) ? jsonData.length : 0
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: 'Fichier resources.json non trouvé. Exécutez sync.js pour créer ce fichier.',
        file: 'resources.json'
      });
    } else {
      console.error('❌ Erreur lors de la lecture de resources.json:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        file: 'resources.json'
      });
    }
  }
};

// Route pour /resources et /resources.json
router.get('/resources', handleResourcesRequest);
router.get('/resources.json', handleResourcesRequest);

// Récupérer le fichier forecast-report.json
router.get('/forecast-report', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'forecast-report.json');
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    res.json({
      success: true,
      file: 'forecast-report.json',
      data: jsonData,
      count: Array.isArray(jsonData) ? jsonData.length : 0
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: 'Fichier forecast-report.json non trouvé. Exécutez report.js pour créer ce fichier.',
        file: 'forecast-report.json'
      });
    } else {
      console.error('❌ Erreur lors de la lecture de forecast-report.json:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        file: 'forecast-report.json'
      });
    }
  }
});

// Récupérer le fichier deliveries.json
router.get('/deliveries.json', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'deliveries.json');
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    res.json({
      success: true,
      file: 'deliveries.json',
      data: jsonData,
      count: jsonData.data ? jsonData.data.length : (Array.isArray(jsonData) ? jsonData.length : 0)
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: 'Fichier deliveries.json non trouvé. Exécutez extract_deliveries.js pour créer ce fichier.',
        file: 'deliveries.json'
      });
    } else {
      console.error('❌ Erreur lors de la lecture de deliveries.json:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        file: 'deliveries.json'
      });
    }
  }
});

// Récupérer les temps prévisionnels et saisis
router.get('/forecast-times.json', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'forecast-times.json');
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    res.json({
      success: true,
      file: 'forecast-times.json',
      data: jsonData
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Créer le fichier s'il n'existe pas
      const initialData = {
        metadata: {
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          description: "Temps prévisionnels et saisis par prestation et par mois"
        },
        data: {}
      };
      await fs.writeFile(filePath, JSON.stringify(initialData, null, 2), 'utf8');
      res.json({
        success: true,
        file: 'forecast-times.json',
        data: initialData
      });
    } else {
      console.error('❌ Erreur lors de la lecture de forecast-times.json:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        file: 'forecast-times.json'
      });
    }
  }
});

// Sauvegarder les temps prévisionnels
router.post('/forecast-times', async (req, res) => {
  try {
    const { deliveryId, month, hours } = req.body;
    
    if (!deliveryId || !month || hours === undefined) {
      return res.status(400).json({
        success: false,
        error: 'deliveryId, month et hours sont requis'
      });
    }

    const filePath = path.join(dataDir, 'forecast-times.json');
    
    // Lire le fichier existant
    let jsonData;
    try {
      const data = await fs.readFile(filePath, 'utf8');
      jsonData = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Créer le fichier s'il n'existe pas
        jsonData = {
          metadata: {
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            description: "Temps prévisionnels et saisis par prestation et par mois"
          },
          data: {}
        };
      } else {
        throw error;
      }
    }

    // Initialiser la structure si nécessaire
    if (!jsonData.data) {
      jsonData.data = {};
    }
    if (!jsonData.data[deliveryId]) {
      jsonData.data[deliveryId] = {};
    }
    if (!jsonData.data[deliveryId].forecast) {
      jsonData.data[deliveryId].forecast = {};
    }

    // Mettre à jour les temps prévisionnels
    jsonData.data[deliveryId].forecast[month] = parseFloat(hours) || 0;
    jsonData.metadata.lastUpdated = new Date().toISOString();

    // Sauvegarder
    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');

    res.json({
      success: true,
      message: 'Temps prévisionnel sauvegardé',
      data: jsonData.data[deliveryId]
    });
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde des temps prévisionnels:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Récupérer le fichier temps_missions.json
router.get('/temps_missions.json', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'temps_missions.json');
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    res.json({
      success: true,
      file: 'temps_missions.json',
      data: jsonData,
      count: jsonData.data ? jsonData.data.length : 0
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: 'Fichier temps_missions.json non trouvé. Exécutez extract_time_reports.js pour créer ce fichier.',
        file: 'temps_missions.json'
      });
    } else {
      console.error('❌ Erreur lors de la lecture de temps_missions.json:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        file: 'temps_missions.json'
      });
    }
  }
});

// Récupérer le fichier timesheets_data.json
router.get('/timesheets_data.json', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'timesheets_data.json');
    const data = await fs.readFile(filePath, 'utf8');
    
    // Parser avec gestion des grands nombres
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch (parseError) {
      console.error('❌ Erreur lors du parsing JSON:', parseError);
      throw new Error(`Erreur de parsing JSON: ${parseError.message}`);
    }
    
    // S'assurer que tous les IDs sont des chaînes pour éviter les problèmes de sérialisation
    const sanitizeIds = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(sanitizeIds);
      } else if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          if ((key.includes('Id') || key.includes('id')) && typeof value === 'number') {
            sanitized[key] = String(value);
          } else if (typeof value === 'object') {
            sanitized[key] = sanitizeIds(value);
          } else {
            sanitized[key] = value;
          }
        }
        return sanitized;
      }
      return obj;
    };
    
    const sanitizedData = sanitizeIds(jsonData);
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      file: 'timesheets_data.json',
      data: sanitizedData,
      count: sanitizedData.data ? sanitizedData.data.length : 0
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: 'Fichier timesheets_data.json non trouvé. Exécutez sync_timesheets.js pour créer ce fichier.',
        file: 'timesheets_data.json'
      });
    } else {
      console.error('❌ Erreur lors de la lecture de timesheets_data.json:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        file: 'timesheets_data.json',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// Récupérer le fichier timesheets_aggregate.json
router.get('/timesheets_aggregate.json', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'timesheets_aggregate.json');
    const data = await fs.readFile(filePath, 'utf8');
    
    // Parser avec gestion des grands nombres
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch (parseError) {
      console.error('❌ Erreur lors du parsing JSON:', parseError);
      throw new Error(`Erreur de parsing JSON: ${parseError.message}`);
    }
    
    // S'assurer que tous les IDs sont des chaînes pour éviter les problèmes de sérialisation
    const sanitizeIds = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(sanitizeIds);
      } else if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          if ((key.includes('Id') || key.includes('id')) && typeof value === 'number') {
            sanitized[key] = String(value);
          } else if (typeof value === 'object') {
            sanitized[key] = sanitizeIds(value);
          } else {
            sanitized[key] = value;
          }
        }
        return sanitized;
      }
      return obj;
    };
    
    const sanitizedData = sanitizeIds(jsonData);
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      file: 'timesheets_aggregate.json',
      data: sanitizedData,
      count: sanitizedData.data ? sanitizedData.data.length : 0
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: 'Fichier timesheets_aggregate.json non trouvé. Exécutez sync_timesheets.js pour créer ce fichier.',
        file: 'timesheets_aggregate.json'
      });
    } else {
      console.error('❌ Erreur lors de la lecture de timesheets_aggregate.json:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        file: 'timesheets_aggregate.json',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// Gérer les métadonnées des ressources (temps, statut feu, commentaires)
router.get('/resources-metadata', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'resources_metadata.json');
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    res.json({
      success: true,
      data: jsonData
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Fichier n'existe pas encore, retourner un objet vide
      res.json({
        success: true,
        data: {}
      });
    } else {
      console.error('❌ Erreur lors de la lecture de resources_metadata.json:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
});

router.post('/resources-metadata', async (req, res) => {
  try {
    const filePath = path.join(dataDir, 'resources_metadata.json');
    const metadata = req.body;
    
    // S'assurer que le dossier data existe
    await fs.mkdir(dataDir, { recursive: true });
    
    // Sauvegarder les métadonnées
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: 'Métadonnées sauvegardées avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde de resources_metadata.json:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
