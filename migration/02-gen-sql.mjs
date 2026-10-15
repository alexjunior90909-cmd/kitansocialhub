/**
 * 02-gen-sql.mjs — generate exact DDL for the new project from the captured
 * source OpenAPI schema, plus the RLS/storage policy pack the app requires.
 * Output: migration/sql/00-ALL-IN-ONE.sql (run once in the SQL Editor).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'state', 'source-schema.json'), 'utf8'));

// App-required unique constraints (documented in the audit; not visible in OpenAPI)
const UNIQUE_OVERRIDES = {
  wallets: ['app_user_id'],
  registered_users: ['email'],
  order_content: ['(product_id, product_type)'],
  smspool_price_overrides: ['(country_id, service_name)'],
};

function pgType(name, prop) {
  const f = prop.format || '';
  if (f === 'ARRAY') {
    const itemFmt = prop.items?.format || '';
    const inner = { 'character varying': 'text', text: 'text', integer: 'integer', bigint: 'bigint', numeric: 'numeric', uuid: 'uuid', 'timestamp with time zone': 'timestamptz' }[itemFmt] || 'text';
    return inner + '[]';
  }
  const map = {
    'text': 'text',
    'character varying': 'text',
    'jsonb': 'jsonb',
    'json': 'jsonb',
    'numeric': 'numeric',
    'integer': 'integer',
    'bigint': 'bigint',
    'smallint': 'smallint',
    'boolean': 'boolean',
    'timestamp with time zone': 'timestamptz',
    'timestamp without time zone': 'timestamp',
    'date': 'date',
    'uuid': 'uuid',
    'real': 'real',
    'double precision': 'double precision',
  };
  if (map[f]) return map[f];
  // fallback from JSON type
  const t = prop.type;
  if (t === 'integer') return 'integer';
  if (t === 'number') return 'numeric';
  if (t === 'boolean') return 'boolean';
  if (Array.isArray(t)) return 'jsonb';
  return 'text';
}

function defaultFor(prop) {
  if (!('default' in prop)) return '';
  const d = prop.default;
  if (d === null) return ' DEFAULT NULL';
  const f = pgType('', prop);
  // PostgREST stringifies expression defaults; detect and pass through as SQL.
  if (typeof d === 'string' && /^\([\w.]+\(.*\)\)$/.test(d)) {
    const expr = d.slice(1, -1);
    return ` DEFAULT ${expr}${f === 'text' ? '::text' : ''}`;
  }
  if (f === 'jsonb') {
    const s = typeof d === 'string' ? d : JSON.stringify(d);
    return ` DEFAULT '${s.replace(/'/g, "''")}'::jsonb`;
  }
  if (f === 'boolean') return ` DEFAULT ${d ? 'true' : 'false'}`;
  if (f === 'timestamptz' || f === 'timestamp') {
    return d === 'now()' ? ' DEFAULT now()' : ` DEFAULT '${d}'`;
  }
  if (f === 'text') return ` DEFAULT '${String(d).replace(/'/g, "''")}'`;
  return ` DEFAULT ${d}`;
}

const sqlParts = [];
sqlParts.push(`-- ============================================================================
-- KitanSocialHub — FULL SCHEMA for the new Supabase project
-- Generated automatically from the old backend's live schema (OpenAPI capture).
-- Idempotent: safe to re-run. Preserves app-generated text IDs.
-- ============================================================================

-- Drop nothing. Create tables only if missing (CREATE IF NOT EXISTS).
`);

for (const [table, def] of Object.entries(spec)) {
  const cols = [];
  const pkCols = [];
  for (const [col, prop] of Object.entries(def.properties || {})) {
    const isPk = /Primary Key\.<pk\/>/.test(prop.description || '');
    if (isPk) pkCols.push(col);
    cols.push(`  ${quoteIdent(col)} ${pgType(col, prop)}${isPk ? ' NOT NULL' : ''}${defaultFor(prop)}`);
  }
  const uniques = (UNIQUE_OVERRIDES[table] || []).map(u => {
    const cname = `${table}_${u.replace(/[^a-z_]/gi, '')}_key`;
    return `CREATE UNIQUE INDEX IF NOT EXISTS ${cname} ON public.${table} (${u});`;
  }).map(s => s.replace('((', '(').replace('))', ')'));
  const pk = pkCols.length ? `  PRIMARY KEY (${pkCols.map(quoteIdent).join(', ')})` : '';
  sqlParts.push(`CREATE TABLE IF NOT EXISTS public.${table} (
${cols.join(',\n')}${pk ? ',\n' + pk : ''}
);`);
  if (uniques.length) sqlParts.push(...uniques);
}

function quoteIdent(s) { return `"${s}"`; }

sqlParts.push(`
-- ============================================================================
-- RLS — the application performs ALL operations with the public/publishable
-- key (no Supabase Auth; identity is client-side). The old backend was fully
-- permissive for the anon role; the app requires the same to function.
-- (Harden later as a separate, planned project — not during migration.)
-- ============================================================================
`);

for (const table of Object.keys(spec)) {
  sqlParts.push(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.${table};
CREATE POLICY "kitan anon all" ON public.${table}
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);`);
}

sqlParts.push(`
-- ============================================================================
-- STORAGE — bucket write policies (buckets themselves are created via API).
-- order-content: admin uploads order images with the anon key (existing model)
-- products/documents/working-pictures/formats/website-products: admin media
-- uploads + Base64 migration tool (Admin → Media Migr) with the anon key.
-- ============================================================================

DROP POLICY IF EXISTS "kitan media public read" ON storage.objects;
CREATE POLICY "kitan media public read" ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('order-content','products','documents','working-pictures','formats','website-products'));

DROP POLICY IF EXISTS "kitan media anon insert" ON storage.objects;
CREATE POLICY "kitan media anon insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id IN ('order-content','products','documents','working-pictures','formats','website-products'));

DROP POLICY IF EXISTS "kitan media anon update" ON storage.objects;
CREATE POLICY "kitan media anon update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id IN ('order-content','products','documents','working-pictures','formats','website-products'));

DROP POLICY IF EXISTS "kitan media anon delete" ON storage.objects;
CREATE POLICY "kitan media anon delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id IN ('order-content','products','documents','working-pictures','formats','website-products'));
`);

fs.mkdirSync(path.join(here, 'sql'), { recursive: true });
const out = path.join(here, 'sql', '00-ALL-IN-ONE.sql');
fs.writeFileSync(out, sqlParts.join('\n\n') + '\n');
console.log('Wrote', out, '-', sqlParts.length, 'statements');
console.log('Tables covered:', Object.keys(spec).length);
