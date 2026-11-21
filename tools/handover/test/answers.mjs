// Answers the pipeline's prompts in the tests (HANDOVER_ANSWERS points here).
// HANDOVER_TEST_SCRIPT is a JSON file: { "<prompt id>": [ step, step, ... ] }, one step
// per time the prompt is asked. A step may first act as a person through the fake's
// /_control routes ("control": [[route, body], ...]; "{{scriptId}}" / "{{sheetId}}" are
// taken from the pipeline's state), then gives its "answer" (default: Enter).
// A prompt asked more often than scripted fails the test.

import fs from 'node:fs';

const script = JSON.parse(fs.readFileSync(process.env.HANDOVER_TEST_SCRIPT, 'utf8'));
const used = {};

const fill = (v, state) => JSON.parse(JSON.stringify(v).replace(/\{\{(\w+)\}\}/g, (_, k) => state[k] ?? ''));

export async function answer(id, state) {
  const steps = script[id];
  used[id] = (used[id] ?? -1) + 1;
  if (!steps || used[id] >= steps.length) return undefined;
  const step = steps[used[id]];
  for (const [route, body] of step.control || []) {
    const res = await fetch(process.env.FAKE_GOOGLE_URL + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fill(body || {}, state)),
    });
    const out = await res.json();
    if (!res.ok || out.ok === false) throw new Error(`control ${route} failed: ${JSON.stringify(out)}`);
  }
  return step.answer ?? '';
}
