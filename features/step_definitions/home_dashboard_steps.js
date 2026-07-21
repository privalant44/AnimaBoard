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
    await this.page.waitForSelector('[data-testid="home-recap-chart-view"]', { timeout: 10000 });
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

  const chartView = this.page.locator('[data-testid="home-recap-chart-view"]');
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
