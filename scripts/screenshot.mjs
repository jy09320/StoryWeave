import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'pitch', 'canva-assets');
await mkdir(outDir, { recursive: true });

const BASE = 'http://localhost:3001';
const PROJECT_ID = '01KTE30GTSSPK5GCN6N4NZWGTR';  // 星辰之约
const CHAPTER_ID = '01KTE30GTTJZCS3CGR9FG3VZAX';   // 第一章 星落凡尘

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

// Login page
await page.goto(`${BASE}/login`);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: join(outDir, '01-login.png'), fullPage: false });
console.log('✓ login page');

// Fill login form with huaiyun account
await page.fill('input[type="email"]', '3079966793@qq.com');
await page.fill('input[type="password"]', '123456tpf');
await page.click('button[type="submit"]');
await page.waitForURL(/workspace|dashboard|assets|\//, { timeout: 10000 }).catch(() => {});
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

// Dashboard / Home after login
await page.screenshot({ path: join(outDir, '02-dashboard.png'), fullPage: false });
console.log('✓ dashboard');

// Assets - Characters
await page.goto(`${BASE}/assets/characters`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
await page.screenshot({ path: join(outDir, '03-characters.png'), fullPage: false });
console.log('✓ characters');

// Project workspace (星辰之约)
await page.goto(`${BASE}/projects/${PROJECT_ID}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
await page.screenshot({ path: join(outDir, '04-project-workspace.png'), fullPage: false });
console.log('✓ project workspace');

// Editor (第一章)
await page.goto(`${BASE}/projects/${PROJECT_ID}/editor/${CHAPTER_ID}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
await page.screenshot({ path: join(outDir, '05-editor.png'), fullPage: false });
console.log('✓ editor');

// World building
await page.goto(`${BASE}/projects/${PROJECT_ID}/world`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
await page.screenshot({ path: join(outDir, '06-world.png'), fullPage: false });
console.log('✓ world');

// Graph
await page.goto(`${BASE}/projects/${PROJECT_ID}/graph`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
await page.screenshot({ path: join(outDir, '07-graph.png'), fullPage: false });
console.log('✓ graph');

// AI workspace
await page.goto(`${BASE}/projects/${PROJECT_ID}/ai-workspace`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
await page.screenshot({ path: join(outDir, '08-ai-workspace.png'), fullPage: false });
console.log('✓ ai workspace');

// AI Toolbox
await page.goto(`${BASE}/ai-toolbox`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
await page.screenshot({ path: join(outDir, '09-ai-toolbox.png'), fullPage: false });
console.log('✓ ai toolbox');

await browser.close();
console.log(`\nAll screenshots saved to: ${outDir}`);
