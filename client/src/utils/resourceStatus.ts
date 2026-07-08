export const RETOUR_PLANIFIE_STATUT = 'Retour planifié';
export const RETOUR_IMMINENT_STATUT = 'Retour imminent';

function normalizeStatutLabel(statut: string): string {
  return statut
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Statuts nécessitant une date de retour prévisionnelle (libellés Boond). */
export function hasDateRetourPrevisionnelle(statut: string | undefined): boolean {
  if (!statut) return false;
  const n = normalizeStatutLabel(statut);
  return (
    n === 'retour planifie' ||
    n.includes('retour planifie') ||
    n === 'retour imminent' ||
    n.includes('retour imminent')
  );
}

/** @deprecated Préférer hasDateRetourPrevisionnelle */
export function isRetourImminentStatut(statut: string | undefined): boolean {
  return hasDateRetourPrevisionnelle(statut);
}

/** Mois YYYY-MM strictement avant le mois de la date de retour prévisionnelle (YYYY-MM-DD). */
export function isMonthBeforeProvisionalReturn(month: string, returnDate: string | undefined): boolean {
  if (!returnDate) return false;
  const returnMonth = returnDate.slice(0, 7);
  return month < returnMonth;
}
