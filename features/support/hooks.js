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
    this.baseUrl = null;
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
    this.page = await sharedBrowser.newPage();
  }
});

After(async function () {
  if (this.page) {
    await this.page.close();
    this.page = null;
  }
});

module.exports = { AccessWorld };
