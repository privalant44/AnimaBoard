/**
 * Détermine le nombre de jours facturables d'une prestation pour le CA prévisionnel.
 *
 * Sur le mois courant, le prévisionnel représente l'objectif saisi dans l'écran Forecast,
 * pas un reliquat à ajouter au réalisé. Dès que du temps réel existe, il le remplace donc
 * afin de ne pas compter deux fois les mêmes jours.
 */
function getForecastRevenueDays({ month, currentMonth, actualDays, forecastDays }) {
  const actual = Number(actualDays) || 0;
  const forecast = Number(forecastDays) || 0;

  if (month === currentMonth && actual > 0) {
    return actual;
  }

  return actual + forecast;
}

module.exports = {
  getForecastRevenueDays,
};
