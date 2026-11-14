#!/usr/bin/env node
/**
 * End-to-end smoke test of a running site: web, API, queue, database and at
 * least one judge, driven through the browser.
 *
 *   pnpm --filter @skyoj/web test:e2e
 *
 * Signs in as an administrator, creates a problem with testdata, submits a
 * correct solution in every language plus a few wrong ones, and checks each
 * verdict. Then exercises the problem editor's forms (rejudge, attachments)
 * and the judge list.
 * Exits with status 1 on the first failure.
 *
 * On a fresh site (`docker compose up`, `pnpm docker:prod`) nothing needs
 * configuring: the first account registered becomes the owner. Elsewhere,
 * pass an administrator's credentials.
 *
 * Environment:
 *   BASE_URL          site to test (default http://localhost:3000)
 *   E2E_USER          administrator's e-mail or nickname (optional)
 *   E2E_PASSWORD
 *   E2E_TIMEOUT_MS    longest wait for one verdict (default 60000)
 */
import { strToU8, zipSync } from 'fflate';
import { chromium } from 'playwright';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const VERDICT_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 60_000);

/** "Sum of two numbers": two testcases. */
const TESTDATA = zipSync({
  '1.in': strToU8('1 2\n'),
  '1.ans': strToU8('3\n'),
  '2.in': strToU8('1000000000 -7\n'),
  '2.ans': strToU8('999999993\n'),
});

const C_SUM =
  '#include <stdio.h>\nint main(void){long long a,b;scanf("%lld %lld",&a,&b);printf("%lld\\n",a+b);return 0;}';
const CPP_SUM = '#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}';
const CPP23_SUM =
  '#include <iostream>\n#include <print>\nint main(){long long a,b;std::cin>>a>>b;std::println("{}",a+b);}';
const PY_SUM = 'print(sum(map(int, input().split())))';

const CASES = [
  { language: 'c', code: C_SUM, verdict: 'Accepted' },
  { language: 'cpp', code: CPP_SUM, verdict: 'Accepted' },
  { language: 'cpp23', code: CPP_SUM, verdict: 'Accepted' },
  { language: 'clang-cpp17', code: CPP_SUM, verdict: 'Accepted' },
  { language: 'clang-cpp23', code: CPP23_SUM, verdict: 'Accepted' },
  { language: 'py3', code: PY_SUM, verdict: 'Accepted' },
  { language: 'py3', code: 'print(1 + sum(map(int, input().split())))', verdict: 'Wrong Answer' },
  { language: 'cpp', code: 'int main() { return undefined_name; }', verdict: 'Compile Error' },
  { language: 'py3', code: 'raise SystemExit(3)', verdict: 'Runtime Error' },
  { language: 'c', code: 'int main(void) { for (;;) {} }', verdict: 'Time Limit Exceeded' },
  // Touches 1 GiB at once; the judge's memory cgroup must report it as MLE, not as a crash.
  { language: 'py3', code: 'b = bytearray(1 << 30)', verdict: 'Memory Limit Exceeded' },
];

let failures = 0;
function check(condition, message) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) failures++;
}

async function signIn(page) {
  if (process.env.E2E_USER) {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[name=identifier]', process.env.E2E_USER);
    await page.fill('[name=password]', process.env.E2E_PASSWORD ?? '');
    await page.click('button:has-text("Log in")');
  } else {
    const nickname = `e2e${Date.now() % 1_000_000}`;
    await page.goto(`${BASE_URL}/register`);
    await page.fill('[name=email]', `${nickname}@example.com`);
    await page.fill('[name=nickname]', nickname);
    await page.fill('[name=password]', 'e2e-password');
    await page.fill('[name=repeat]', 'e2e-password');
    await page.click('button:has-text("Register")');
  }
  await page.waitForSelector('button:has-text("Log out")');
  if ((await page.locator('a[href="/admin"]').count()) === 0) {
    throw new Error('Not an administrator: on a site with accounts, set E2E_USER and E2E_PASSWORD');
  }
}

async function createProblem(page) {
  await page.goto(`${BASE_URL}/problems`);
  await page.fill('[name=title]', 'E2E: sum of two numbers');
  await page.click('button:has-text("Create problem")');
  await page.waitForURL(/\/problems\/\d+\/edit/);
  const id = Number(/problems\/(\d+)/.exec(page.url())?.[1]);

  await page.fill('[name=content]', 'Print $a + b$.');
  await page.fill('[name=timeLimitMs]', '1000');
  await page.check('[name=submitOpen]');
  await page.click('button:has-text("Save")');
  await page.getByRole('status').first().waitFor();
  check((await page.getByRole('status').first().textContent())?.includes('saved'), 'problem settings saved');

  await page.setInputFiles('input[aria-label="Testdata archive"]', {
    name: 'testdata.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(TESTDATA),
  });
  await page.click('button:has-text("Upload testcases")');
  await page.waitForSelector('text=now has 2 testcases');
  check(true, 'testdata uploaded');
  return id;
}

async function judge(page, problemId, { language, code }) {
  await page.goto(`${BASE_URL}/problems/${problemId}`);
  await page.fill('[name=code]', code);
  await page.selectOption('[name=language]', language);
  await page.click('button:has-text("Submit")');
  await page.waitForURL(/\/submissions\/\d+/);
  await page.waitForFunction(
    () => !/Waiting|Judging/.test(document.querySelector('[aria-live]')?.textContent ?? 'Waiting'),
    null,
    { timeout: VERDICT_TIMEOUT_MS },
  );
  return (await page.textContent('[aria-live]')) ?? '';
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await signIn(page);
    const problemId = await createProblem(page);

    for (const testCase of CASES) {
      const outcome = await judge(page, problemId, testCase);
      check(outcome.includes(testCase.verdict), `${testCase.language}: ${testCase.verdict}`);
    }

    await page.goto(`${BASE_URL}/problems/${problemId}/edit`);
    await page.click('button:has-text("Rejudge all submissions")');
    await page.waitForSelector(`text=Queued ${CASES.length} submissions`);
    check(true, 'rejudge reports in its own card');

    await page.setInputFiles('input[aria-label="Attachment"]', {
      name: 'sample.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('1 2\n'),
    });
    await page.click('button:has-text("Upload"):not(:has-text("testcases"))');
    await page.waitForSelector('text=Uploaded sample.txt.');
    const download = await page.request.get(`${BASE_URL}/problems/${problemId}/attachments/sample.txt`);
    check(download.ok() && (await download.text()) === '1 2\n', 'attachment uploaded and served');

    await page.goto(`${BASE_URL}/admin`);
    const judges = (await page.locator('table', { hasText: 'Languages' }).textContent()) ?? '';
    check(/Online/.test(judges), 'a judge is online and listed with its languages');
    check(
      pageErrors.length === 0,
      `no script errors in the browser${pageErrors.length ? `: ${pageErrors.join('; ')}` : ''}`,
    );
  } finally {
    await browser.close();
  }
  if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
