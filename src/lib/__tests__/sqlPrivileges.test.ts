import { readFileSync } from 'fs';
import { join } from 'path';

// Guards against the bug fixed by function_privileges_hardening.sql: a
// security definer function that anyone with the anon key can call.
//
// Files run after the hardening (by the order in supabase/README.md) must
// revoke each new security definer function from public/anon themselves.

const SUPABASE = join(__dirname, '../../../supabase');
const HARDENING = 'function_privileges_hardening.sql';

function runOrder(): string[] {
  const readme = readFileSync(join(SUPABASE, 'README.md'), 'utf8');
  return [...readme.matchAll(/^\| (\d+) \| `([^`]+\.sql)` \|/gm)].sort((a, b) => Number(a[1]) - Number(b[1])).map((m) => m[2]);
}

function definerFunctions(sql: string): string[] {
  const out: string[] = [];
  for (const m of sql.matchAll(/create or replace function public\.(\w+)\s*\([\s\S]*?\)\s*returns\s+(\w+)[\s\S]*?\$\$/gi)) {
    const header = m[0];
    if (m[2].toLowerCase() === 'trigger') continue;
    if (/security definer/i.test(header)) out.push(m[1]);
  }
  return out;
}

function revokedFromAnon(sql: string): Set<string> {
  const out = new Set<string>();
  for (const m of sql.matchAll(/revoke (?:all|execute) on function public\.(\w+)[^;]*from ([^;]+);/gi)) {
    if (/\b(public|anon)\b/i.test(m[2])) out.add(m[1]);
  }
  return out;
}

describe('SQL function privileges', () => {
  const order = runOrder();

  it('lists the hardening file in the run order', () => {
    expect(order).toContain(HARDENING);
  });

  it('revokes every security definer function added after the hardening', () => {
    const after = order.slice(order.indexOf(HARDENING) + 1);
    const missing: string[] = [];
    for (const file of after) {
      const sql = readFileSync(join(SUPABASE, file), 'utf8');
      const revoked = revokedFromAnon(sql);
      for (const fn of definerFunctions(sql)) if (!revoked.has(fn)) missing.push(`${file}: ${fn}`);
    }
    expect(missing).toEqual([]);
  });

  it('keeps send_push_notification away from the app', () => {
    const sql = readFileSync(join(SUPABASE, HARDENING), 'utf8');
    expect(sql).toMatch(/revoke all on function public\.send_push_notification\([^)]*\) from public, anon, authenticated;/);
  });
});
