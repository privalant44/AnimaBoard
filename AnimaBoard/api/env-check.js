/**
 * GET /api/env-check - Vérifie quelles variables d'environnement sont présentes au runtime.
 * N'affiche jamais les valeurs, uniquement "set": true/false.
 */
const vars = [
  'BOOND_EMAIL',
  'BOOND_PASSWORD',
  'BOOND_PASSWORD_ENC',
  'ANIMA_SECRET_KEY',
  'BOOND_API_URL',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
];

module.exports = async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    const status = {};
    for (const name of vars) {
      const value = process.env[name];
      status[name] = { set: !!value, length: value ? value.length : 0 };
    }
    const ready = !!(process.env.BOOND_EMAIL && (process.env.BOOND_PASSWORD || (process.env.BOOND_PASSWORD_ENC && process.env.ANIMA_SECRET_KEY)));
    return res.status(200).json({
      ok: true,
      message: ready ? 'Variables Boond présentes' : 'Il manque BOOND_EMAIL et (BOOND_PASSWORD ou BOOND_PASSWORD_ENC+ANIMA_SECRET_KEY)',
      env: status
    });
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
};
