import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { RunRegistry } from './runs.js';
import type { RunRecord } from './types.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

// Fixtures may live next to the source (dev, tsx) or be copied into dist (prod).
// Try both; skip silently if neither exists.
const CANDIDATE_DIRS = [
  join(moduleDir, 'fixtures'),
  join(moduleDir, '../src/fixtures'),
];

// Load any captured fixture runs into the registry on boot. These are real
// recorded runs (with real screenshots) so the UI can be demoed and developed
// without spending API credit — and they serve as the recorded-run demo backup.
export function loadFixtures(registry: RunRegistry): number {
  const dir = CANDIDATE_DIRS.find((d) => existsSync(d));
  if (!dir) return 0;

  let loaded = 0;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(dir, file), 'utf8');
      const record = JSON.parse(raw) as RunRecord;
      if (!record.id || !Array.isArray(record.events)) continue;
      registry.insert(record);
      loaded++;
    } catch {
      // A malformed fixture must never take the server down.
    }
  }
  return loaded;
}
