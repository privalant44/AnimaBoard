import { hasDateRetourPrevisionnelle } from './resourceStatus';

export type ResourceMetadataEntry = {
  tempsTravail?: string;
  statutFeu?: 'vert' | 'orange' | 'rouge' | '';
  commentaires?: string;
  /** Date active tant que le statut Boond est « Retour planifié » (ou équivalent). */
  dateRetourPrevisionnelle?: string;
  /** Conservée lorsque le statut change dans Boond — hors affichage, pour historique. */
  derniereDateRetourPrevisionnelle?: string;
};

/**
 * Si le statut Boond n'est plus éligible, déplace la date active vers l'historique
 * et vide le champ affiché (sans supprimer l'information).
 */
export function archiveReturnDateIfNeeded(
  resources: { id: number; statut?: string }[],
  metadata: Record<number, ResourceMetadataEntry>
): { metadata: Record<number, ResourceMetadataEntry>; changed: boolean } {
  let changed = false;
  const next: Record<number, ResourceMetadataEntry> = { ...metadata };

  for (const resource of resources) {
    if (hasDateRetourPrevisionnelle(resource.statut)) continue;

    const entry = next[resource.id];
    const activeDate = entry?.dateRetourPrevisionnelle?.trim();
    if (!activeDate) continue;

    next[resource.id] = {
      ...entry,
      derniereDateRetourPrevisionnelle: activeDate,
    };
    delete next[resource.id].dateRetourPrevisionnelle;
    changed = true;
  }

  return { metadata: next, changed };
}

/** Date utilisée pour le grisage forecast : uniquement le statut éligible + date active. */
export function getActiveReturnDate(
  statut: string | undefined,
  metadata: ResourceMetadataEntry | undefined
): string | undefined {
  if (!hasDateRetourPrevisionnelle(statut)) return undefined;
  const d = metadata?.dateRetourPrevisionnelle?.trim();
  return d || undefined;
}
