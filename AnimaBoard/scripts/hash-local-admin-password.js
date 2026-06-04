#!/usr/bin/env node
/**
 * Génère LOCAL_ADMIN_PASSWORD_HASH (scrypt, base64) pour .env
 * Usage : node scripts/hash-local-admin-password.js "VotreMotDePasse"
 */
const crypto = require('crypto');
const { SCRYPT_SALT } = require('../lib/localAuth');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-local-admin-password.js "<mot de passe>"');
  process.exit(1);
}

const hash = crypto.scryptSync(password, SCRYPT_SALT, 64).toString('base64');
console.log('LOCAL_ADMIN_PASSWORD_HASH=' + hash);
