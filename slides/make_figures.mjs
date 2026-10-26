/**
 * make_figures.mjs — retakes the form screenshots used in survey_intro.tex.
 *
 * Starts the Vite dev server, loads a neutral example draft ("Example code")
 * into the form, and saves cropped, high-resolution captures to slides/figures/.
 * Run after the form's wording or layout changes:
 *
 *     npm run slides:figures
 *
 * Needs a Chromium-based browser (Chrome, Brave, Edge or Chromium). Set
 * BROWSER_PATH to its executable if it is not found automatically.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'slides', 'figures')
const PORT = 4179
const URL = `http://localhost:${PORT}/hpc-questionnaire/`

const BROWSERS = [
  process.env.BROWSER_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/brave-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean)
const executablePath = BROWSERS.find(p => fs.existsSync(p))
if (!executablePath) throw new Error('No Chromium-based browser found; set BROWSER_PATH to its executable.')

const h = v => ({ value: v, unit: 'hours' })
const gb = v => ({ value: v, unit: 'GB' })
// Neutral example answers: one code with two kinds of job, problems on Gargi only
const DRAFT = {
  X_systems_used: ['gargi', 'national'], X_problems: ['wall_time_termination', 'insufficient_node_count', 'software_unavailable'],
  X_problems_gargi: ['wall_time_termination', 'insufficient_node_count'], X_gargi_nonuse: 'yes_some', X_problems_raman: ['not_used'],
  W_workloads: [
    { W_code: 'Example code', W_job_kind: 'long production runs', W_source: 'gargi', W_cluster: 'gargi', W_affected: ['wall_time_termination'],
      W_org: ['long_calc'], W_device: 'cpu', W_nodes: 2, W_cores: 256, W_walltime: h(100), W_mem_node: gb(200) },
    { W_code: 'Example code', W_job_kind: 'many short test runs', W_source: 'gargi', W_cluster: 'gargi', W_affected: ['wall_time_termination'],
      W_org: ['independent'], W_device: 'cpu', W_nodes: 2, W_cores: 256, W_walltime: h(80) },
  ],
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL)).ok) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Dev server did not start at ${URL}`)
}

/** Saves `loc` (from its top down to the bottom of `untilLoc`, if given) as figures/<file>. */
async function capture(page, loc, file, untilLoc, extra = 10, pad = 8) {
  await loc.scrollIntoViewIfNeeded()
  const box = await loc.evaluate(el => {
    const r = el.getBoundingClientRect()
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height }
  })
  let height = box.height
  if (untilLoc) {
    const u = await untilLoc.evaluate(el => el.getBoundingClientRect().bottom + window.scrollY)
    height = u - box.y + extra
  }
  await page.screenshot({
    path: path.join(OUT, file), fullPage: true,
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: height + 2 * pad },
  })
  console.log('saved', file)
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
try {
  await waitForServer()
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ executablePath })
  const open = async width => {
    const page = await browser.newPage({ viewport: { width, height: 1400 }, deviceScaleFactor: 3 })
    await page.goto(URL)
    await page.evaluate(d => localStorage.setItem('hpc_questionnaire_v3_draft', JSON.stringify(d)), DRAFT)
    await page.reload()
    return page
  }
  const next = async page => { await page.getByRole('button', { name: /^Next/ }).first().click(); await page.waitForTimeout(400) }
  const block = (scope, text) => scope.locator('.question-block', { hasText: text }).first()

  // Narrow layout: Section B questions and the top of a Section C entry
  let page = await open(560)
  await next(page)
  await capture(page, block(page, 'Which of these did your group face on Gargi'), 'b_gargi.png')
  await capture(page, block(page, 'Did these problems stop your group'), 'b_nonuse.png')
  await next(page)
  const row = page.locator('.repeatable-row').first()
  await capture(page, row, 'c_entry.png', block(row, 'Kind of job this entry describes'), 10, 0)
  await page.close()

  // Wide layout: the pattern question and a Section D panel
  page = await open(1000)
  await page.getByRole('button', { name: /Your Workloads/ }).click(); await page.waitForTimeout(400)
  await capture(page, block(page.locator('.repeatable-row').first(), 'Which patterns describe'), 'c_patterns.png')
  await page.getByRole('button', { name: /Details for Each Code/ }).click(); await page.waitForTimeout(400)
  const panel = page.locator('.repeatable-row').nth(1).locator('.row-block', { hasText: 'Long runs' })
  await capture(page, panel, 'd_panel.png', panel.locator('.question-block').first(), 0, 4)
  await browser.close()
} finally {
  server.kill()
}
