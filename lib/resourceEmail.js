/**
 * Extrait l'e-mail d'une ressource Boond (colonne raw ou champs plats).
 */
function getResourceEmail(resource) {
  if (!resource) return null;
  const raw = resource.raw || resource.Raw || {};
  const candidates = [
    resource.email,
    resource.Email,
    raw.email,
    raw.Email,
    raw.attributes?.email,
    raw.attributes?.Email,
    raw.contact?.email,
    raw.contact?.Email,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.includes('@')) {
      return value.trim().toLowerCase();
    }
  }
  return null;
}

function resourceMatchesUserEmail(resource, userEmail) {
  const normalizedUser = String(userEmail || '').trim().toLowerCase();
  if (!normalizedUser || !normalizedUser.includes('@')) return false;
  const resourceEmail = getResourceEmail(resource);
  return resourceEmail === normalizedUser;
}

function filterResourcesByUserEmail(resources, userEmail) {
  const list = Array.isArray(resources) ? resources : [];
  return list.filter((r) => resourceMatchesUserEmail(r, userEmail));
}

module.exports = {
  getResourceEmail,
  resourceMatchesUserEmail,
  filterResourcesByUserEmail,
};
