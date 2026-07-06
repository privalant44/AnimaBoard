const DEFAULT_BASE_URL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';

function getBoondAuthConfig(email, password, timeoutMs = 60000) {
  return {
    auth: { username: email, password },
    headers: {
      Accept: 'application/hal+json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: timeoutMs,
    validateStatus: (status) => status < 500,
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  getBoondAuthConfig,
};
