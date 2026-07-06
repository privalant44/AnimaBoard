/**
 * Extraction identité depuis le payload JWT (Microsoft ou local).
 */
function getUserEmailFromAuth(authPayload) {
  if (!authPayload) return '';
  return String(
    authPayload.preferred_username || authPayload.email || authPayload.upn || ''
  )
    .trim()
    .toLowerCase();
}

function getDisplayNameFromAuth(authPayload) {
  if (!authPayload) return 'Utilisateur';
  return (
    authPayload.name ||
    authPayload.displayName ||
    authPayload.preferred_username ||
    authPayload.email ||
    'Utilisateur'
  );
}

module.exports = {
  getUserEmailFromAuth,
  getDisplayNameFromAuth,
};
