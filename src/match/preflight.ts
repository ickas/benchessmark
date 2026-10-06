import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import type { Difference } from '../record/types.js';
import type { Setup } from '../setup.js';
import type { Player, WireRequest } from '../players/types.js';

/** JSON with sorted keys, so two equal objects give one string. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );
}

export const shortHash = (value: unknown) =>
  createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 6);

const withoutModel = ({ model: _model, ...rest }: WireRequest) => rest;

/**
 * Runs before game 1. Each model player builds its own first request for the
 * same position; with the model field removed they must be identical.
 * Returns the hash of that request, or of the setup when a player is code.
 */
export function assertSameRequest(setup: Setup, a: Player, b: Player): string {
  if (!a.requestFor || !b.requestFor) return shortHash(setup);

  const chess = new Chess();
  const ra = withoutModel(a.requestFor(chess));
  const rb = withoutModel(b.requestFor(chess));
  if (stableJson(ra) !== stableJson(rb)) {
    throw new Error(
      `The two players would not get the same request:\n${stableJson(ra)}\n${stableJson(rb)}`,
    );
  }
  if (stableJson(a.transport) !== stableJson(b.transport)) {
    throw new Error(
      `The two players do not share transport settings: ${stableJson(a.transport)} / ${stableJson(b.transport)}`,
    );
  }
  return shortHash(ra);
}

const color = process.stdout.isTTY
  ? { g: (s: string) => `\x1b[32m${s}\x1b[0m`, y: (s: string) => `\x1b[33m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m`, d: (s: string) => `\x1b[2m${s}\x1b[0m` }
  : { g: (s: string) => s, y: (s: string) => s, b: (s: string) => s, d: (s: string) => s };

/** The side-by-side table printed before a match. */
export function formatSetupCheck(
  setup: Setup,
  a: Player,
  b: Player,
  hash: string,
  differences: Difference[],
  games: number,
): string {
  const L = 18;
  const C = 18;
  const ok = color.g('✓');
  const row = (label: string, x: string, y: string, mark = '') =>
    `${label.padEnd(L)}${x.padEnd(C)}${y.padEnd(C - 1)}${mark ? ` ${mark}` : ''}`;
  const same = (x: unknown, y: unknown) => (stableJson(x) === stableJson(y) ? ok : color.y('≠'));
  const models = Boolean(a.requestFor && b.requestFor);

  const lines = [
    `${color.b('Setup check')} ${color.d(`· ${a.info.id}-vs-${b.info.id} · ${games} games`)}`,
    '',
    row('', color.b(a.info.name) + ' '.repeat(Math.max(0, C - a.info.name.length - 1)), color.b(b.info.name)),
  ];

  if (models) {
    const chess = new Chess();
    const qa = a.requestFor!(chess).questions;
    const qb = b.requestFor!(chess).questions;
    lines.push(
      row('model', a.info.slug, b.info.slug),
      row('transport', a.transport!.transport, b.transport!.transport, same(a.transport!.transport, b.transport!.transport)),
      row('state', setup.state, setup.state, ok),
      row('question', `#${shortHash(qa)}`, `#${shortHash(qb)}`, same(qa, qb)),
      row('pick', setup.pick, setup.pick, ok),
      row('timeout, retries', `${a.transport!.timeoutMs / 1000} s, ${a.transport!.retries}`, `${b.transport!.timeoutMs / 1000} s, ${b.transport!.retries}`, same([a.transport!.timeoutMs, a.transport!.retries], [b.transport!.timeoutMs, b.transport!.retries])),
      row('effort, temp', 'none exist', 'none exist', ok),
      row('first request', `same except model #${hash}`, '', ok),
    );
  } else {
    lines.push(
      row('kind', a.info.kind, b.info.kind),
      row('setup', `#${hash}`, `#${hash}`, ok),
      '',
      ...[a, b].map((p) => `${p.info.name}: ${p.info.slug}`),
    );
  }

  if (differences.length) {
    lines.push('', color.y('Not settable'));
    for (const d of differences) {
      lines.push(row(d.what, d.white, d.black, d.white === d.black ? ok : color.y('!')));
    }
  }
  return lines.join('\n');
}
