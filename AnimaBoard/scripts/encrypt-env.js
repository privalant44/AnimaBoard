/**
 * Chiffre une valeur pour la stocker dans .env (ex. BOOND_CLEF_CLIENT_ENC).
 * Usage:
 *   set ANIMA_SECRET_KEY= votre_mot_de_passe_fort
 *   node scripts/encrypt-env.js "valeur_a_chiffrer"
 * Puis ajoutez dans .env : BOOND_PASSWORD_ENC=<sortie_du_script>
 * Ne commitez jamais .env ni ANIMA_SECRET_KEY.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

const value = process.argv[2];
const keyRaw = process.argv[3] || process.env.ANIMA_SECRET_KEY;

if (!value) {
  console.error('Usage: node scripts/encrypt-env.js "valeur_a_chiffrer" [ANIMA_SECRET_KEY]');
  console.error('  ou définir ANIMA_SECRET_KEY dans .env');
  process.exit(1);
}
if (!keyRaw || keyRaw.length < 8) {
  console.error('Définissez ANIMA_SECRET_KEY (8 caractères min) dans .env ou en 2e argument.');
  process.exit(1);
}

const key = crypto.createHash('sha256').update(keyRaw, 'utf8').digest();
const iv = crypto.randomBytes(IV_LEN);
const cipher = crypto.createCipheriv(ALGO, key, iv);
const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
const out = Buffer.concat([iv, tag, enc]).toString('base64');
console.log(out);
