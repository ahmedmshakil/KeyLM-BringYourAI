import { prisma } from '@/lib/db';

type SchemaSupportCache = Map<string, boolean>;

const globalForSchemaCompat = globalThis as unknown as {
  schemaSupportCache?: SchemaSupportCache;
};

const schemaSupportCache = globalForSchemaCompat.schemaSupportCache ?? new Map<string, boolean>();

if (process.env.NODE_ENV !== 'production') {
  globalForSchemaCompat.schemaSupportCache = schemaSupportCache;
}

async function readExists(query: Promise<Array<{ exists: boolean }>>) {
  try {
    const [row] = await query;
    return Boolean(row?.exists);
  } catch {
    return false;
  }
}

async function hasTable(tableName: string) {
  const cacheKey = `table:${tableName}`;
  if (schemaSupportCache.has(cacheKey)) {
    return schemaSupportCache.get(cacheKey) ?? false;
  }

  const exists = await readExists(prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists"
  `);

  schemaSupportCache.set(cacheKey, exists);
  return exists;
}

async function hasColumn(tableName: string, columnName: string) {
  const cacheKey = `column:${tableName}:${columnName}`;
  if (schemaSupportCache.has(cacheKey)) {
    return schemaSupportCache.get(cacheKey) ?? false;
  }

  const exists = await readExists(prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `);

  schemaSupportCache.set(cacheKey, exists);
  return exists;
}

export function clearSchemaSupportCache() {
  schemaSupportCache.clear();
}

export async function supportsRateLimitBucket() {
  return hasTable('RateLimitBucket');
}

export async function supportsSessionVersion() {
  return hasColumn('User', 'sessionVersion');
}

export async function supportsUserProfileFields() {
  const [hasFullName, hasProfileImageUrl, hasProfileImageSize, hasProfileImageMimeType] = await Promise.all([
    hasColumn('User', 'fullName'),
    hasColumn('User', 'profileImageUrl'),
    hasColumn('User', 'profileImageSize'),
    hasColumn('User', 'profileImageMimeType')
  ]);

  return hasFullName && hasProfileImageUrl && hasProfileImageSize && hasProfileImageMimeType;
}