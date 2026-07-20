const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const {
  PERMISSIONS,
  getPermissionsForRole,
  getRoleLabel,
  ROLE_LABELS,
} = require('../../lib/roles');
const { setMockAuth } = require('../support/testApp');
const { deriveTabsFromPermissions } = require('./access_steps');

const ROLE_SIMULATION_TITLE_PREFIX = 'Simutation du rôle ';

function buildRoleSimulationTitle(roleLabel) {
  return `${ROLE_SIMULATION_TITLE_PREFIX}${roleLabel}`;
}

const LOCAL_SESSION_KEY = 'anima_local_auth_v1';

const TAB_TEST_IDS = {
  home: 'nav-tab-home',
  resources: 'nav-tab-resources',
  forecast: 'nav-tab-forecast',
  report: 'nav-tab-report',
  settings: 'nav-tab-settings',
};

async function seedAuthSession(page, email) {
  await page.addInitScript(
    ({ storageKey, userEmail }) => {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          token: 'bdd-test-token',
          displayName: 'Administrateur test',
          email: userEmail,
        })
      );
    },
    { storageKey: LOCAL_SESSION_KEY, userEmail: email }
  );
}

Given('l\'administrateur se connecte à l\'administration des utilisateur', async function () {
  this.role = 'admin';
  this.email = 'admin@animaneo.fr';
  this.permissions = getPermissionsForRole('admin');

  setMockAuth({
    email: this.email,
    role: 'admin',
    roleLabel: ROLE_LABELS.admin,
    permissions: this.permissions,
  });

  if (!this.page || !this.baseUrl) return;

  await seedAuthSession(this.page, this.email);
  await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
  await this.page.waitForSelector('[data-testid="nav-tab-settings"]', { timeout: 15000 });
  await this.page.locator('[data-testid="nav-tab-settings"]').click({ force: true });
  await this.page.waitForSelector('[data-testid="settings-hub-users"]', { timeout: 15000 });
  await this.page.locator('[data-testid="settings-hub-users"]').click({ force: true });
  await this.page.waitForSelector('[data-testid="settings-users-panel"]', { timeout: 15000 });
  await this.page.waitForSelector('[data-testid="role-view-preview"]', { timeout: 15000 });
});

When('l\'administarteur simule un rôle', async function () {
  this.simulatedRole = await this.page.locator('[data-testid="role-preview-role-select"]').inputValue();
  this.simulatedRoleLabel = getRoleLabel(this.simulatedRole);
  this.simulatedPermissions = getPermissionsForRole(this.simulatedRole);

  const popupPromise = this.page.waitForEvent('popup');
  await this.page.locator('[data-testid="role-preview-start-simulation"]').click({ force: true });
  this.simulationPage = await popupPromise;
  await this.simulationPage.waitForLoadState('networkidle');
  await this.simulationPage.waitForSelector('[data-testid="role-simulation-banner"]', {
    timeout: 15000,
  });
});

Then(
  'une nouvelle fenetre du navigateur avec la vue exact de l\'application par le rôle et le titre en noir avec écriture blanche : "Simutation du rôle " et le nom du rôle',
  async function () {
    assert.ok(this.simulationPage, 'La fenêtre de simulation devrait être ouverte');

    const expectedTitle = buildRoleSimulationTitle(this.simulatedRoleLabel);
    const bannerTitle = this.simulationPage.locator('[data-testid="role-simulation-title"]');
    await bannerTitle.waitFor({ state: 'visible', timeout: 10000 });
    const bannerText = (await bannerTitle.textContent())?.trim();
    assert.strictEqual(bannerText, expectedTitle);

    const banner = this.simulationPage.locator('[data-testid="role-simulation-banner"]');
    const styles = await banner.evaluate((node) => {
      const computed = window.getComputedStyle(node);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
      };
    });
    assert.strictEqual(styles.backgroundColor, 'rgb(0, 0, 0)');
    assert.strictEqual(styles.color, 'rgb(255, 255, 255)');

    const pageTitle = await this.simulationPage.title();
    assert.strictEqual(pageTitle, expectedTitle);

    const allowedTabs = deriveTabsFromPermissions(this.simulatedPermissions);
    for (const tab of allowedTabs) {
      const testId = TAB_TEST_IDS[tab];
      await this.simulationPage.locator(`[data-testid="${testId}"]`).waitFor({
        state: 'visible',
        timeout: 10000,
      });
    }

    const allTabs = Object.keys(TAB_TEST_IDS);
    for (const tab of allTabs) {
      if (allowedTabs.includes(tab)) continue;
      const count = await this.simulationPage.locator(`[data-testid="${TAB_TEST_IDS[tab]}"]`).count();
      assert.strictEqual(count, 0, `L'onglet ${tab} ne devrait pas être visible en simulation`);
    }

    if (this.simulatedPermissions.includes(PERMISSIONS.VIEW_HOME_FINANCIAL)) {
      await this.simulationPage.locator('[data-testid="nav-tab-home"]').click({ force: true });
      await this.simulationPage
        .locator('[data-testid="home-view-financial"]')
        .waitFor({ state: 'visible', timeout: 10000 });
    }

    if (this.simulatedPermissions.includes(PERMISSIONS.VIEW_FORECAST_PERSONAL)) {
      await this.simulationPage.locator('[data-testid="nav-tab-forecast"]').click({ force: true });
      await this.simulationPage
        .locator('[data-testid="forecast-page"]')
        .waitFor({ state: 'visible', timeout: 10000 });
    }

    await this.simulationPage.close();
    this.simulationPage = null;
  }
);

module.exports = {
  TAB_TEST_IDS,
};
