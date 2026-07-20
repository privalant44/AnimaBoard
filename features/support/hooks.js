const { setWorldConstructor, BeforeAll, AfterAll, Before, After, setDefaultTimeout } = require('@cucumber/cucumber');
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { startTestApp, stopTestApp } = require('./testApp');

class AccessWorld {
  constructor() {
    this.role = null;
    this.email = null;
    this.permissions = [];
    this.resources = [];
    this.page = null;
    this.context = null;
    this.baseUrl = null;
    this.simulationPage = null;
    this.simulatedRole = null;
    this.simulatedRoleLabel = null;
    this.simulatedPermissions = [];
  }
}

setWorldConstructor(AccessWorld);
setDefaultTimeout(60 * 1000);

let sharedBrowser = null;
let sharedBaseUrl = null;

BeforeAll({ timeout: 180000 }, async function () {
  const buildIndex = path.join(__dirname, '..', '..', 'client', 'build', 'index.html');
  if (fs.existsSync(buildIndex)) {
    sharedBaseUrl = await startTestApp();
    sharedBrowser = await chromium.launch({ headless: true });
  }
});

AfterAll(async function () {
  if (sharedBrowser) await sharedBrowser.close();
  await stopTestApp();
});

Before(async function () {
  this.baseUrl = sharedBaseUrl;
  if (sharedBrowser) {
    this.context = await sharedBrowser.newContext();
    await this.context.addInitScript(
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
      { storageKey: 'anima_local_auth_v1', userEmail: 'test@animaneo.fr' }
    );
    this.page = await this.context.newPage();
  }
});

After(async function () {
  if (this.simulationPage) {
    await this.simulationPage.close();
    this.simulationPage = null;
  }
  if (this.page) {
    await this.page.close();
    this.page = null;
  }
  if (this.context) {
    await this.context.close();
    this.context = null;
  }
});

module.exports = { AccessWorld };
