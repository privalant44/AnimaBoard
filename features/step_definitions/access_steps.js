const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const {
  PERMISSIONS,
  getPermissionsForRole,
  normalizePermissions,
  shouldRestrictForecastToPersonal,
} = require('../../lib/roles');
const { filterResourcesByUserEmail } = require('../../lib/resourceEmail');
const { setMockAuth } = require('../support/testApp');

const LOCAL_SESSION_KEY = 'anima_local_auth_v1';

const TAB_TEST_IDS = {
  home: 'nav-tab-home',
  resources: 'nav-tab-resources',
  forecast: 'nav-tab-forecast',
  report: 'nav-tab-report',
  settings: 'nav-tab-settings',
};

const VIEW_TEST_IDS = {
  'view:home:financial': 'home-view-financial',
  'view:home:besoins': 'home-view-besoins',
  'view:home:treasury': 'home-view-treasury',
  'view:forecast:personal': 'forecast-page',
  'view:forecast:scenarios': 'forecast-scenarios-btn',
  'view:report:forecast': 'report-view-forecast',
  'view:report:income': 'report-view-income',
  'tab:settings': 'nav-tab-settings',
};

const HOME_VIEW_LOCATORS = {
  'view:home:financial':
    '[data-testid="home-view-financial"], [data-testid="home-recap-chart-financial"]',
  'view:home:besoins':
    '[data-testid="home-view-besoins"], [data-testid="home-recap-chart-besoins"]',
};

function parsePermissionList(raw) {
  return String(raw || '')
    .split(/\s+et\s+|\s*,\s*/)
    .map((part) => part.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function deriveTabsFromPermissions(permissions) {
  const tabs = [];
  if (
    permissions.includes(PERMISSIONS.TAB_HOME) ||
    permissions.some((p) => p.startsWith('view:home:'))
  ) {
    tabs.push('home');
  }
  if (permissions.includes(PERMISSIONS.TAB_RESOURCES)) tabs.push('resources');
  if (
    permissions.includes(PERMISSIONS.TAB_FORECAST) ||
    permissions.includes(PERMISSIONS.VIEW_FORECAST_PERSONAL) ||
    permissions.includes(PERMISSIONS.VIEW_FORECAST_SCENARIOS)
  ) {
    tabs.push('forecast');
  }
  if (
    permissions.includes(PERMISSIONS.TAB_REPORT) ||
    permissions.includes(PERMISSIONS.VIEW_REPORT_FORECAST) ||
    permissions.includes(PERMISSIONS.VIEW_REPORT_INCOME)
  ) {
    tabs.push('report');
  }
  if (permissions.includes(PERMISSIONS.TAB_SETTINGS)) tabs.push('settings');
  return tabs;
}

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

Given('l\'utilisateur est habilité avec le rôle {string}', function (role) {
  this.role = role;
});

Given('l\'utilisateur est de rôle consultation', function () {
  this.role = 'consultation';
});

Given('le rôle {string} a les permissions {string}', function (role, permissionsRaw) {
  assert.strictEqual(role, this.role);
  this.permissions = normalizePermissions(parsePermissionList(permissionsRaw));
});

Given('la ressource {string} a l\'adresse mail {string}', function (resourceId, email) {
  this.resources.push({
    id: Number(resourceId),
    nom: 'Test',
    prenom: 'User',
    raw: { email },
  });
});

Given('une autre ressource {string} a l\'adresse mail {string}', function (resourceId, email) {
  this.resources.push({
    id: Number(resourceId),
    nom: 'Autre',
    prenom: 'User',
    raw: { email },
  });
});

When('l\'utilisateur se connecte', async function () {
  const permissions =
    this.permissions.length > 0 ? this.permissions : getPermissionsForRole(this.role);
  this.permissions = permissions;
  this.email = this.email || `${this.role}@animaneo.fr`;

  setMockAuth({
    email: this.email,
    role: this.role,
    roleLabel: this.role,
    permissions,
  });

  if (this.page && this.baseUrl) {
    await seedAuthSession(this.page, this.email);
    await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
    await this.page.waitForSelector('[data-testid="nav-tab-home"], [data-testid="nav-tab-forecast"]', {
      timeout: 15000,
    });
  }
});

When('l\'utilisateur {string} se connecte', async function (email) {
  this.role = 'consultation';
  this.email = email;
  this.permissions = getPermissionsForRole('consultation');
  setMockAuth({
    email,
    role: 'consultation',
    roleLabel: 'Consultation',
    permissions: this.permissions,
  });

  if (this.page && this.baseUrl) {
    await seedAuthSession(this.page, email);
    await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
    await this.page.waitForSelector('[data-testid="nav-tab-forecast"]', { timeout: 15000 });
    await this.page.locator('[data-testid="nav-tab-forecast"]').click({ force: true });
    await this.page.waitForSelector('[data-testid="forecast-page"]', { timeout: 15000 });
  }
});

Then('l\'utilisateur ne voit que les modules et vues {string}', async function (permissionsRaw) {
  const expected = normalizePermissions(parsePermissionList(permissionsRaw));
  const effective = normalizePermissions(this.permissions);

  for (const permission of expected) {
    assert.ok(effective.includes(permission), `Permission attendue absente: ${permission}`);
  }

  if (this.page && this.baseUrl) {
    for (const permission of expected) {
      const testId = VIEW_TEST_IDS[permission];
      if (!testId) continue;
      if (permission.startsWith('view:home:')) {
        await this.page.locator('[data-testid="nav-tab-home"]').click({ force: true });
      }
      if (permission.startsWith('view:forecast:')) {
        await this.page.locator('[data-testid="nav-tab-forecast"]').click({ force: true });
      }
      if (permission.startsWith('view:report:')) {
        await this.page.locator('[data-testid="nav-tab-report"]').click({ force: true });
      }
      const locator = HOME_VIEW_LOCATORS[permission]
        ? this.page.locator(HOME_VIEW_LOCATORS[permission]).first()
        : this.page.locator(`[data-testid="${testId}"]`);
      await locator.waitFor({ state: 'visible', timeout: 10000 });
    }
  }
});

Then('l\'utilisateur ne voit pas la vue {string}', async function (permission) {
  assert.ok(!this.permissions.includes(permission), `Permission interdite présente: ${permission}`);

  if (this.page && this.baseUrl) {
    const testId = VIEW_TEST_IDS[permission];
    if (!testId) return;
    if (permission.startsWith('view:home:')) {
      await this.page.locator('[data-testid="nav-tab-home"]').click({ force: true });
    }
    const count = await this.page.locator(`[data-testid="${testId}"]`).count();
    assert.strictEqual(count, 0, `La vue ${permission} ne devrait pas être visible`);
  }
});

Then('l\'utilisateur ne voit pas l\'onglet {string}', async function (tab) {
  assert.ok(!deriveTabsFromPermissions(this.permissions).includes(tab));

  if (this.page && this.baseUrl) {
    const count = await this.page.locator(`[data-testid="${TAB_TEST_IDS[tab]}"]`).count();
    assert.strictEqual(count, 0, `L'onglet ${tab} ne devrait pas être visible`);
  }
});

Then('l\'utilisateur ne voit que son forecast personnel', function () {
  assert.strictEqual(this.role, 'consultation');
  assert.ok(shouldRestrictForecastToPersonal('consultation', this.permissions));

  const filtered = filterResourcesByUserEmail(this.resources, this.email);
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, 42);
});

Then('l\'utilisateur ne voit pas le bouton scénarios forecast', async function () {
  assert.ok(!this.permissions.includes(PERMISSIONS.VIEW_FORECAST_SCENARIOS));

  if (this.page && this.baseUrl) {
    const count = await this.page.locator('[data-testid="forecast-scenarios-btn"]').count();
    assert.strictEqual(count, 0);
  }
});

Then('le rôle consultation a la permission forecast personnel par défaut', async function () {
  const permissions = getPermissionsForRole('consultation');
  assert.ok(permissions.includes(PERMISSIONS.VIEW_FORECAST_PERSONAL));
});

module.exports = {
  parsePermissionList,
  deriveTabsFromPermissions,
};
