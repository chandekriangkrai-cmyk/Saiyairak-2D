const { chromium, devices } = require('playwright-core');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const mode = process.argv[2] ?? 'desktop';
assert.ok(['desktop', 'touch', 'baseline'].includes(mode));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const touch = mode === 'touch';
    const page = await browser.newPage(touch ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } });
    const username = 'qa-' + Date.now();
    const password = 'qa-synthetic-test-only';
    const auth = { username, password };
    const signup = await page.request.post(base + '/api/v1/signup', { data: { ...auth, type: 'user' } });
    assert.equal(signup.status(), 200);
    const login = await page.request.post(base + '/api/v1/signin', { data: auth });
    assert.equal(login.status(), 200);
    const { token } = await login.json();
    const response = await page.request.get(base + '/api/v1/space/official');
    const { spaces } = await response.json();
    const classroom = spaces.find(space => space.code === 'CLASS01');
    assert.ok(classroom);
    console.log('QA route:', '/space/' + classroom.id);
    await page.addInitScript(({ token, username }) => {
      localStorage.setItem('tm.token', token);
      localStorage.setItem('tm.username', username);
    }, { token, username });
    const sent = [], received = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => {
      if (!socket.url().includes('/socket')) return;
      socket.on('framesent', ({ payload }) => { const m = JSON.parse(payload.toString()); if (m.type === 'move') sent.push(m.payload); });
      socket.on('framereceived', ({ payload }) => received.push(JSON.parse(payload.toString())));
    });
    await page.goto(base + '/space/' + classroom.id);
    await page.locator('canvas').first().waitFor({ timeout: 45000 });
    for (let i = 0; i < 80 && !received.some(m => m.type === 'space-joined'); i++) await pause(100);
    const spawn = received.find(m => m.type === 'space-joined')?.payload.spawn;
    assert.deepEqual(spawn, { x: 18, y: 14 });
    const joystick = page.locator('button[aria-keyshortcuts]');
    const cdp = touch && await page.context().newCDPSession(page);
    async function hold(key, ms, end = 'touchEnd') {
      if (!touch) {
        await page.keyboard.down(key);
        await pause(ms);
        await page.keyboard.up(key);
        return;
      }
      const box = await joystick.boundingBox();
      assert.ok(box);
      const x = box.x + box.width / 2 + (key === 'ArrowRight' ? 30 : 0);
      const y = box.y + box.height / 2 + (key === 'ArrowDown' ? 30 : key === 'ArrowUp' ? -30 : 0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await pause(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] });
    }
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('school-time-save-v1')));
    if (!touch) await page.locator('canvas').first().click({ position: { x: 250, y: 220 }, force: true });
    await hold('ArrowDown', 6500);
    await pause(250);
    const rejected = received.filter(m => m.type === 'movement-rejected');
    const south = await saved();
    console.log('South movement:', JSON.stringify({ sent, rejected: rejected.length, saved: { x: south.x, y: south.y } }));
    if (mode === 'baseline') {
      assert.ok(rejected.length > 0, 'Expected server rollback at invisible furniture');
      assert.ok(rejected.every(({ payload }) => payload.x === 18 && payload.y === 18));
      console.log('Baseline reproduced: server rolled back the player to row 18');
      return;
    }
    assert.equal(await page.title(), 'FUN CLASS 2D');
    assert.equal(rejected.length, 0);
    assert.deepEqual({ x: south.x, y: south.y }, { x: 18, y: 20 });
    await hold('ArrowUp', 7500);
    await pause(250);
    assert.equal((await saved()).y, 10, 'Teacher desk must stop the player');
    assert.equal(received.filter(m => m.type === 'movement-rejected').length, 0);
    const afterRelease = sent.length;
    await pause(400);
    assert.equal(sent.length, afterRelease, 'Released input must stop movement');
    if (touch) {
      await hold('ArrowDown', 900, 'touchCancel');
      // CDP can resolve before the DOM handler and buffered WS frames reach the test.
      await joystick.getByText('·', { exact: true }).waitFor();
      await pause(150);
      const afterCancel = sent.length;
      const canceledTile = await saved();
      await pause(600);
      assert.equal(sent.length, afterCancel, 'Canceled touch must stop movement');
      assert.deepEqual(await saved(), canceledTile);
      assert.ok(canceledTile.y > 10);
    }
    let previous = spawn;
    for (const next of sent) {
      assert.equal(Math.abs(next.x - previous.x) + Math.abs(next.y - previous.y), 1);
      previous = next;
    }
    if (!touch) {
      const library = spaces.find(space => space.code === 'LIBRARY');
      assert.ok(library);
      await hold('ArrowRight', 6500);
      await page.waitForURL(base + '/space/' + library.id, { timeout: 12000 });
      console.log('East classroom doorway opened the Study Library');
    }
    assert.deepEqual(errors, []);
    console.log(mode + ' PASS: student aisle, teacher desk, adjacent WebSocket steps, input release' + (touch ? ' and touch cancellation' : ''));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
