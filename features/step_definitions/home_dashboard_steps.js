const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const { getPermissionsForRole } = require('../../lib/roles');
const { setMockAuth } = require('../support/testApp');

const LOCAL_SESSION_KEY = 'anima_local_auth_v1';

async function seedAuthSession(page, email) {
  await page.addInitScript(
    ({ storageKey, userEmail }) => {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          token: 'bdd-test-token',
          displayName: 'Utilisateur test',
          email: userEmail,
        })
      );
    },
    { storageKey: LOCAL_SESSION_KEY, userEmail: email }
  );
}

Given('la connexion à la page d\'accueil', async function () {
  this.role = 'manager';
  this.email = 'manager@animaneo.fr';
  this.permissions = getPermissionsForRole('manager');

  setMockAuth({
    email: this.email,
    role: this.role,
    roleLabel: 'Manager',
    permissions: this.permissions,
  });

  if (!this.page || !this.baseUrl) return;

  await seedAuthSession(this.page, this.email);
  await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
  await this.page.waitForSelector('[data-testid="nav-tab-home"]', { timeout: 15000 });
});

When('l\'utilisateur arrive sur la page d\'accueil', async function () {
  if (!this.page || !this.baseUrl) return;

  await this.page.locator('[data-testid="nav-tab-home"]').click({ force: true });
  await this.page.waitForSelector('[data-testid="home-dashboard"]', { timeout: 15000 });
});

Then(
  'il voit 3 graphiques dans 3 zones sur 2 colonnes avec la possibilité de voir le tableau détaillé du graphique',
  async function () {
    if (!this.page || !this.baseUrl) return;

    const grid = this.page.locator('[data-testid="home-dashboard-grid"]');
    await grid.waitFor({ state: 'visible', timeout: 10000 });

    const gridColumns = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
    assert.match(gridColumns, / /, 'La grille devrait être sur 2 colonnes');

    const zones = [
      { id: 'home-zone-financial', chartTestId: 'home-recap-view-chart', tableTestId: 'home-recap-view-table', tableViewTestId: 'home-recap-table-view', chartViewTestId: 'home-recap-chart-view' },
      { id: 'home-zone-besoins', chartTestId: 'home-zone-besoins-view-chart', tableTestId: 'home-zone-besoins-view-table', tableViewTestId: 'home-zone-besoins-table-view', chartViewTestId: 'home-recap-chart-view' },
      { id: 'home-zone-treasury', chartTestId: 'home-zone-treasury-view-chart', tableTestId: 'home-zone-treasury-view-table', tableViewTestId: 'home-zone-treasury-table-view', chartViewTestId: 'home-treasury-chart-view' },
    ];
    for (const zone of zones) {
      const zoneLocator = this.page.locator(`[data-testid="${zone.id}"]`);
      await zoneLocator.waitFor({ state: 'visible', timeout: 10000 });

      const chartToggle = zoneLocator.locator(`[data-testid="${zone.chartTestId}"]`);
      await chartToggle.click({ force: true });

      const chartSection = zoneLocator.locator(`[data-testid="${zone.chartViewTestId}"]`);
      await chartSection.waitFor({ state: 'visible', timeout: 10000 });
      assert.ok(await chartSection.isVisible(), `Le graphique de ${zone.id} devrait être visible`);

      const tableToggle = zoneLocator.locator(`[data-testid="${zone.tableTestId}"]`);
      await tableToggle.click({ force: true });

      const tableView = zoneLocator.locator(`[data-testid="${zone.tableViewTestId}"]`);
      await tableView.waitFor({ state: 'visible', timeout: 10000 });
      assert.ok(await tableView.isVisible(), `Le tableau de ${zone.id} devrait être visible`);

      await chartToggle.click({ force: true });
    }
  }
);

Then('le statut du batch est indiqué par un statut en bas du menu dépliable', async function () {
  if (!this.page || !this.baseUrl) return;

  const sidebarFooter = this.page.locator('[data-testid="app-sidebar-footer"]');
  await sidebarFooter.waitFor({ state: 'visible', timeout: 10000 });

  const batchStatus = sidebarFooter.locator('[data-testid="home-batch-status"]');
  await batchStatus.waitFor({ state: 'visible', timeout: 10000 });
  assert.ok(await batchStatus.isVisible(), 'Le statut batch devrait être visible dans le menu');

  const footerBox = await sidebarFooter.boundingBox();
  const statusBox = await batchStatus.boundingBox();
  assert.ok(footerBox && statusBox, 'Le statut batch devrait être positionné dans le pied du menu');
  assert.ok(statusBox.y >= footerBox.y, 'Le statut batch devrait être en bas du menu dépliable');
});

Given('un contexte utilisateur valide', async function () {
  this.role = 'manager';
  this.email = 'manager@animaneo.fr';
  this.permissions = getPermissionsForRole('manager');

  setMockAuth({
    email: this.email,
    role: this.role,
    roleLabel: 'Manager',
    permissions: this.permissions,
  });

  if (!this.page || !this.baseUrl) return;

  await seedAuthSession(this.page, this.email);
  await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
  await this.page.waitForSelector('[data-testid="nav-tab-home"]', { timeout: 15000 });
  await this.page.locator('[data-testid="nav-tab-home"]').click({ force: true });
  await this.page.waitForSelector('[data-testid="home-dashboard"]', { timeout: 15000 });
});

When(
  'avoir une représentation graphique des chiffres de la page d\'accueil avec la possibilité d\'avoir le détail sous forme de tableaux',
  async function () {
    if (!this.page || !this.baseUrl) return;

    await this.page.locator('[data-testid="home-recap-view-chart"]').click({ force: true });
    await this.page.locator('[data-testid="home-zone-financial"] [data-testid="home-recap-chart-view"]').waitFor({
      state: 'visible',
      timeout: 10000,
    });
  }
);

Then('le résultat attendu est visible', async function () {
  if (!this.page || !this.baseUrl) return;

  if (this.uxReview) {
    await this.page.locator('[data-testid="app-sidebar"]').waitFor({ state: 'visible', timeout: 10000 });

    const backButtons = this.page.locator('.page-shell .back-button, .page-shell .settings-back-button');
    assert.strictEqual(
      await backButtons.count(),
      0,
      'Les écrans principaux ne devraient pas afficher de bouton Retour redondant'
    );

    await this.page.locator('[data-testid="nav-tab-home"]').click({ force: true });
    await this.page.locator('[data-testid="home-dashboard"]').waitFor({ state: 'visible', timeout: 15000 });
    return;
  }

  const chartView = this.page.locator('[data-testid="home-zone-financial"] [data-testid="home-recap-chart-view"]');
  await chartView.waitFor({ state: 'visible', timeout: 10000 });
  assert.ok(await chartView.isVisible(), 'La vue graphique devrait être visible');

  const financialChart = this.page.locator('[data-testid="home-recap-chart-financial"]');
  await financialChart.waitFor({ state: 'visible', timeout: 10000 });

  await this.page.locator('[data-testid="home-recap-view-table"]').click({ force: true });
  const tableView = this.page.locator('[data-testid="home-recap-table-view"]');
  await tableView.waitFor({ state: 'visible', timeout: 10000 });
  assert.ok(await tableView.isVisible(), 'Le tableau détaillé devrait être visible');

  const financialSection = this.page.locator('[data-testid="home-view-financial"]');
  await financialSection.waitFor({ state: 'visible', timeout: 10000 });

  await this.page.locator('[data-testid="home-recap-view-chart"]').click({ force: true });
  await chartView.waitFor({ state: 'visible', timeout: 10000 });
});
