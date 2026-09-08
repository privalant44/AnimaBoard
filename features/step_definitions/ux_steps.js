const { When } = require('@cucumber/cucumber');
const { getPermissionsForRole } = require('../../lib/roles');
const { setMockAuth } = require('../support/testApp');

const LOCAL_SESSION_KEY = 'anima_local_auth_v1';

const UX_MODULES = [
  { tab: 'home', shell: 'home-dashboard', nav: 'nav-tab-home' },
  { tab: 'resources', shell: 'page-shell-resources', nav: 'nav-tab-resources' },
  { tab: 'forecast', shell: 'page-shell-forecast', nav: 'nav-tab-forecast' },
  { tab: 'report', shell: 'page-shell-report', nav: 'nav-tab-report' },
  { tab: 'settings', shell: 'page-shell-settings', nav: 'nav-tab-settings' },
];

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

When('l\'utilisateur utilise la fonctionnalité', async function () {
  this.uxReview = true;

  if (!this.page || !this.baseUrl) return;

  const adminEmail = 'admin@animaneo.fr';
  setMockAuth({
    email: adminEmail,
    role: 'admin',
    roleLabel: 'Admin',
    permissions: getPermissionsForRole('admin'),
  });
  await seedAuthSession(this.page, adminEmail);
  await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
  await this.page.waitForSelector('[data-testid="nav-tab-home"]', { timeout: 15000 });

  for (const module of UX_MODULES) {
    const nav = this.page.locator(`[data-testid="${module.nav}"]`);
    await nav.click({ force: true });
    await nav.waitFor({ state: 'visible', timeout: 10000 });

    const sidebar = this.page.locator('[data-testid="app-sidebar"]');
    await sidebar.waitFor({ state: 'visible', timeout: 10000 });

    const shell = this.page.locator(`[data-testid="${module.shell}"]`);
    await shell.waitFor({ state: 'visible', timeout: 15000 });

    const ariaCurrent = await nav.getAttribute('aria-current');
    if (ariaCurrent !== 'page') {
      throw new Error(`L'onglet ${module.tab} devrait avoir aria-current="page"`);
    }
  }
});

module.exports = {};
