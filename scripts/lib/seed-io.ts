/**
 * Seed write safety (issue #56).
 *
 * - Zero-provision gate: never write (let alone overwrite) a seed from a
 *   parse that produced no provisions. An empty parse is a pipeline failure,
 *   not an empty statute.
 * - Shrink gate: refuse refreshes that drop the provision count below half
 *   of the committed seed — the signature of a wrong-lineage resolution or a
 *   truncated payload. Operators can delete the old seed deliberately if a
 *   statute genuinely shrank that much.
 * - Atomic writes: write to a temp file in the same directory, then rename.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ParsedAct } from './parser.js';

const SHRINK_GATE_RATIO = 0.5;

function readExistingProvisionCount(seedPath: string): number | null {
  if (!fs.existsSync(seedPath)) return null;
  try {
    const existing = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as Partial<ParsedAct>;
    return existing.provisions?.length ?? 0;
  } catch {
    // An unreadable existing seed must not block a clean refresh write.
    return null;
  }
}

/**
 * Throws when a parsed act must not be written over the seed at `seedPath`.
 */
export function assertSeedRefreshSane(parsed: ParsedAct, seedPath: string): void {
  if (parsed.provisions.length === 0) {
    throw new Error(
      `Refusing to write seed for "${parsed.id}": parse produced zero provisions. ` +
      `An empty parse is an acquisition/parser failure, not an empty statute.`
    );
  }

  const existingCount = readExistingProvisionCount(seedPath);
  if (existingCount !== null && existingCount > 0) {
    const floor = Math.ceil(existingCount * SHRINK_GATE_RATIO);
    if (parsed.provisions.length < floor) {
      throw new Error(
        `Refusing to write seed for "${parsed.id}": provision count would drop from ${existingCount} to ` +
        `${parsed.provisions.length} (floor: ${floor}). This is the signature of a wrong-lineage resolution ` +
        `or truncated payload. Delete ${path.basename(seedPath)} first if the shrink is genuine.`
      );
    }
  }
}

/** Write a seed atomically (same-directory temp file + rename). */
export function writeSeedAtomic(seedPath: string, parsed: ParsedAct): void {
  const dir = path.dirname(seedPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(seedPath)}.tmp-${process.pid}`);
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, seedPath);
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}
