const test = require('node:test');
const assert = require('node:assert/strict');

const { getForecastRevenueDays } = require('../lib/forecastRevenue');

test('le temps saisi remplace le prévisionnel sur le mois courant', () => {
  assert.equal(
    getForecastRevenueDays({
      month: '2026-10',
      currentMonth: '2026-10',
      actualDays: 8,
      forecastDays: 12,
    }),
    8
  );
});

test('le prévisionnel reste utilisé sans temps saisi sur le mois courant', () => {
  assert.equal(
    getForecastRevenueDays({
      month: '2026-10',
      currentMonth: '2026-10',
      actualDays: 0,
      forecastDays: 12,
    }),
    12
  );
});

test('les autres mois non clôturés conservent le calcul existant', () => {
  assert.equal(
    getForecastRevenueDays({
      month: '2026-11',
      currentMonth: '2026-10',
      actualDays: 2,
      forecastDays: 12,
    }),
    14
  );
});
