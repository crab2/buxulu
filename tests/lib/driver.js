// Drives the web preview through real pointer events, finding buttons by their hit id.
class Driver {
  constructor(page) {
    this.page = page;
  }
  async ids() {
    return this.page.evaluate(() => window.__BUXU__.ui.state.hits.map((h) => h.id));
  }
  async scene() {
    return this.page.evaluate(() => {
      const t = window.__BUXU__.game.top();
      return t ? t.constructor.name : null;
    });
  }
  async has(id) {
    return (await this.ids()).includes(id);
  }
  async waitFor(id, timeout = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.has(id)) return true;
      await this.page.waitForTimeout(40);
    }
    throw new Error(`timed out waiting for "${id}" (scene ${await this.scene()}; hits: ${(await this.ids()).join(', ')})`);
  }
  async waitScene(name, timeout = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if ((await this.scene()) === name && !(await this.page.evaluate(() => !!window.__BUXU__.game.transition))) return true;
      await this.page.waitForTimeout(40);
    }
    throw new Error(`timed out waiting for scene ${name}, at ${await this.scene()}`);
  }
  async tap(id) {
    await this.waitFor(id);
    const box = await this.page.evaluate((hid) => {
      const B = window.__BUXU__;
      const h = B.ui.state.hits.slice().reverse().find((r) => r.id === hid);
      const c = window.document.getElementById('game').getBoundingClientRect();
      const k = c.width / B.ui.W;
      return { x: c.left + (h.x + h.w / 2) * k, y: c.top + (h.y + h.h / 2) * k };
    }, id);
    await this.page.mouse.move(box.x, box.y);
    await this.page.mouse.down();
    await this.page.waitForTimeout(25);
    await this.page.mouse.up();
    await this.page.waitForTimeout(45);
  }
  // Click through story lines until the dialogue closes.
  async skipDialogue() {
    while ((await this.scene()) === 'Dialog') {
      if (await this.has('dialog-skip')) await this.tap('dialog-skip');
      else await this.page.waitForTimeout(30);
    }
  }
  async closeModals() {
    while ((await this.scene()) === 'Modal') await this.tap('modal-0');
  }
  async state() {
    return this.page.evaluate(() => JSON.parse(JSON.stringify(window.__BUXU__.store.get())));
  }
  async errors() {
    return this.page.evaluate(() => ({ errors: window.__BUXU__.game.errors, missing: Array.from(window.__BUXU__.font.missing) }));
  }
}
module.exports = { Driver };
