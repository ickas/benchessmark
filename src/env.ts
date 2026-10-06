// Copied from battleship-vs-jev src/env.ts on 2026-10-06.
import { existsSync } from 'node:fs';

/**
 * Loads environment files from the project root, without adding a dependency.
 *
 * `.env.local` is read before `.env`, matching the convention that `.local` holds
 * a developer's own secrets. Variables already set in the real environment always
 * win, so an explicitly exported key is never overridden by a stale file.
 */
const DEFAULT_FILES = ['.env.local', '.env'];

let loaded = false;

export function loadEnv(files: string[] = DEFAULT_FILES): string[] {
  if (loaded) return [];
  loaded = true;

  const read: string[] = [];
  for (const path of files) {
    if (!existsSync(path)) continue;
    try {
      // Node's own loader; it does not overwrite variables already in the environment.
      process.loadEnvFile(path);
      read.push(path);
    } catch (error) {
      console.warn(
        `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return read;
}
