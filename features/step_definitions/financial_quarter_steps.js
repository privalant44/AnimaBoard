const { When, Then } = require('@cucumber/cucumber');
const assert = require('assert');

function firstMonthOfQuarter(quarterKey) {
  const [year, quarterPart] = quarterKey.split('-Q');
  const quarter = Number(quarterPart);
  const month = String((quarter - 1) * 3 + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function quarterMonthTestIds(quarterKey) {
  const [year, quarterPart] = quarterKey.split('-Q');
  const quarter = Number(quarterPart);
  const firstMonthIndex = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map((offset) => {
    const month = String(firstMonthIndex + offset).padStart(2, '0');
    return `home-financial-month-col-${year}-${month}`;
  });
}

async function openFinancialTable(page) {
  await page.locator('[data-testid="home-recap-view-table"]').click({ force: true });
  const tableView = page.locator('[data-testid="home-recap-table-view"]');
  await tableView.waitFor({ state: 'visible', timeout: 10000 });
  return tableView;
}

When(
  'l\'utilisateur replie et déplie un trimestre du tableau financier',
  async function () {
    if (!this.page || !this.baseUrl) return;

    await openFinancialTable(this.page);

    const quarterToggle = this.page
      .locator('[data-testid^="home-financial-quarter-toggle-"]')
      .first();
    await quarterToggle.waitFor({ state: 'visible', timeout: 10000 });

    const testId = await quarterToggle.getAttribute('data-testid');
    const quarterKey = testId.replace('home-financial-quarter-toggle-', '');
    this.financialQuarterKey = quarterKey;
    const monthTestIds = quarterMonthTestIds(quarterKey);

    for (const monthTestId of monthTestIds) {
      await this.page.locator(`[data-testid="${monthTestId}"]`).first().waitFor({
        state: 'visible',
        timeout: 10000,
      });
    }

    await quarterToggle.click({ force: true });

    const quarterCol = this.page.locator(
      `[data-testid="home-financial-quarter-col-${quarterKey}"]`
    );
    await quarterCol.waitFor({ state: 'visible', timeout: 10000 });

    for (const monthTestId of monthTestIds) {
      assert.strictEqual(
        await this.page.locator(`[data-testid="${monthTestId}"]`).count(),
        0,
        `La colonne ${monthTestId} devrait être masquée lorsque le trimestre est replié`
      );
    }

    await quarterToggle.click({ force: true });

    for (const monthTestId of monthTestIds) {
      await this.page.locator(`[data-testid="${monthTestId}"]`).first().waitFor({
        state: 'visible',
        timeout: 10000,
      });
    }

    assert.strictEqual(
      await quarterCol.count(),
      0,
      'La colonne trimestrielle agrégée devrait être masquée après dépliage'
    );
  }
);

Then(
  'les colonnes mensuelles et trimestrielles reflètent l\'état du trimestre',
  async function () {
    if (!this.page || !this.baseUrl) return;

    const tableView = this.page.locator('[data-testid="home-recap-table-view"]');
    await tableView.waitFor({ state: 'visible', timeout: 10000 });
    assert.ok(await tableView.isVisible(), 'Le tableau financier devrait être visible');

    const quarterKey = this.financialQuarterKey;
    assert.ok(quarterKey, 'Un trimestre devrait avoir été testé');

    const quarterToggle = this.page.locator(
      `[data-testid="home-financial-quarter-toggle-${quarterKey}"]`
    );
    await quarterToggle.waitFor({ state: 'visible', timeout: 10000 });
    assert.strictEqual(
      await quarterToggle.getAttribute('aria-expanded'),
      'true',
      'Le trimestre devrait être déplié à la fin du scénario'
    );

    const firstMonthTestId = `home-financial-month-col-${firstMonthOfQuarter(quarterKey)}`;
    await this.page.locator(`[data-testid="${firstMonthTestId}"]`).first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
  }
);

module.exports = {};
