/** Émis après une synchro Paramètres réussie pour recharger les vues ouvertes. */
export const DATA_REFRESH_EVENT = 'anima-data-refresh';

export function dispatchDataRefresh(): void {
  window.dispatchEvent(new CustomEvent(DATA_REFRESH_EVENT));
}
