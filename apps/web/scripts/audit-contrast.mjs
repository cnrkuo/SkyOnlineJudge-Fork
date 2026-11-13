#!/usr/bin/env node
/**
 * Browser-level contrast audit of a running site with axe-core.
 *
 *   pnpm --filter @skyoj/web audit:contrast
 *
 * Crawls same-origin links from the home page (as a guest, then — when
 * AUDIT_USER and AUDIT_PASSWORD are set — as that user, ideally an
 * administrator so every control appears), opens every tab and the
 * column menus, and runs axe's `color-contrast` rule on each state.
 * Exits with status 1 if anything falls below WCAG AA.
 *
 * Environment:
 *   BASE_URL        site to audit (default http://localhost:3000)
 *   AUDIT_USER      e-mail or nickname to log in with (optional)
 *   AUDIT_PASSWORD
 *   AUDIT_MAX_PAGES crawl limit per session (default 60)
 *
 * The unit test styles/contrast.test.ts checks the palette itself; this
 * script catches what only rendering shows (overlaps, opacity, inline
 * colours from third-party markup).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const MAX_PAGES = Number(process.env.AUDIT_MAX_PAGES ?? 60);
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/** Pages that are not HTML or that change state when visited. */
const SKIP = [/^\/logout/, /^\/rpc\//, /\/attachments\//, /\.csv$/];

const findings = new Map();

async function audit(page, label) {
  await page.addScriptTag({ content: axeSource });
  const nodes = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const result = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    return result.violations.flatMap((violation) =>
      violation.nodes.map((node) => {
        const data = node.any[0]?.data ?? {};
        return { ratio: data.contrastRatio, fg: data.fgColor, bg: data.bgColor, size: data.fontSize, target: node.target.join(' ') };
      }),
    );
  });
  for (const node of nodes) {
    const key = `${node.ratio} : 1  ${node.fg} on ${node.bg} (${node.size})`;
    const where = findings.get(key) ?? [];
    where.push(`${label}  ${node.target}`);
    findings.set(key, where);
  }
}

/** Audits a page, then each of its tabs and its column menu. */
async function auditPage(page, path, who) {
  await page.goto(BASE_URL + path, { waitUntil: 'networkidle' });
  await audit(page, `${who} ${path}`);
  for (const tab of await page.locator('[role="tab"]').all()) {
    await tab.click();
    await audit(page, `${who} ${path} [tab: ${(await tab.textContent())?.trim()}]`);
  }
  const menu = page.locator('button[aria-haspopup="menu"]').first();
  if (await menu.count()) {
    await menu.click();
    await page.waitForSelector('[role="menu"]');
    await audit(page, `${who} ${path} [menu]`);
    await page.keyboard.press('Escape');
  }
}

async function crawl(page, who) {
  const queue = ['/'];
  const seen = new Set(queue);
  let visited = 0;
  while (queue.length > 0 && visited < MAX_PAGES) {
    const path = queue.shift();
    await auditPage(page, path, who);
    visited++;
    const links = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.getAttribute('href')));
    for (const href of links) {
      if (!href) continue;
      const url = new URL(href, BASE_URL + path);
      if (url.origin !== new URL(BASE_URL).origin) continue;
      // One instance of each listing filter is enough.
      const next = url.pathname + (url.search && !/page=/.test(url.search) ? url.search : '');
      if (seen.has(next) || SKIP.some((pattern) => pattern.test(url.pathname))) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return visited;
}

const browser = await chromium.launch();
try {
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  let pages = await crawl(guest, 'guest');
  await auditPage(guest, '/login', 'guest');
  await auditPage(guest, '/register', 'guest');

  if (process.env.AUDIT_USER) {
    const member = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await member.goto(`${BASE_URL}/login`);
    await member.fill('[name=identifier]', process.env.AUDIT_USER);
    await member.fill('[name=password]', process.env.AUDIT_PASSWORD ?? '');
    await Promise.all([member.waitForURL((url) => !url.pathname.startsWith('/login')), member.click('main button')]);
    pages += await crawl(member, process.env.AUDIT_USER);
  }

  const total = [...findings.values()].reduce((sum, where) => sum + where.length, 0);
  for (const [key, where] of findings) {
    console.log(`✗ ${key} — ${where.length}×`);
    for (const place of where.slice(0, 3)) console.log(`    ${place}`);
  }
  console.log(`\n${pages} pages audited, ${total} contrast violation(s) in ${findings.size} colour pair(s).`);
  process.exitCode = total > 0 ? 1 : 0;
} finally {
  await browser.close();
}
