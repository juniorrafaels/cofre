import Database from "@tauri-apps/plugin-sql";
import type { Account, AccountWithRelations, ImageRecord, Platform, SecurityQuestion, Tag } from "../types";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:vault.db");
  }
  return dbPromise;
}

function nowIso() {
  return new Date().toISOString();
}

// ---------- Platforms ----------

export async function listPlatforms(): Promise<Platform[]> {
  const db = await getDb();
  return db.select<Platform[]>("SELECT * FROM platforms ORDER BY is_custom ASC, name ASC");
}

export async function createPlatform(values: {
  name: string;
  icon: string | null;
  login_url: string | null;
  website_url: string | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO platforms (name, icon, login_url, website_url, is_custom, created_at) VALUES ($1, $2, $3, $4, 1, $5)",
    [values.name, values.icon, values.login_url, values.website_url, nowIso()],
  );
  return result.lastInsertId ?? 0;
}

export async function updatePlatform(
  id: number,
  values: { name: string; icon: string | null; login_url: string | null; website_url: string | null },
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE platforms SET name = $1, icon = $2, login_url = $3, website_url = $4 WHERE id = $5", [
    values.name,
    values.icon,
    values.login_url,
    values.website_url,
    id,
  ]);
}

export async function deletePlatform(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM platforms WHERE id = $1", [id]);
}

export async function reassignAccountsPlatform(fromPlatformId: number, toPlatformId: number | null): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE accounts SET platform_id = $1, updated_at = $2 WHERE platform_id = $3", [
    toPlatformId,
    nowIso(),
    fromPlatformId,
  ]);
}

// ---------- Tags ----------

export async function listTags(): Promise<Tag[]> {
  const db = await getDb();
  return db.select<Tag[]>("SELECT * FROM tags ORDER BY name ASC");
}

async function ensureTagIds(names: string[]): Promise<number[]> {
  const db = await getDb();
  const ids: number[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    const existing = await db.select<Tag[]>("SELECT * FROM tags WHERE name = $1", [name]);
    if (existing.length > 0) {
      ids.push(existing[0].id);
    } else {
      const result = await db.execute("INSERT INTO tags (name) VALUES ($1)", [name]);
      ids.push(result.lastInsertId ?? 0);
    }
  }
  return ids;
}

// ---------- Accounts ----------

interface AccountRow extends Account {
  platform_name: string | null;
  platform_icon: string | null;
  platform_login_url: string | null;
  platform_website_url: string | null;
  platform_is_custom: number | null;
  platform_created_at: string | null;
}

export async function listAccountsWithRelations(): Promise<AccountWithRelations[]> {
  const db = await getDb();
  const rows = await db.select<AccountRow[]>(
    `SELECT a.*,
            p.name AS platform_name, p.icon AS platform_icon,
            p.login_url AS platform_login_url, p.website_url AS platform_website_url,
            p.is_custom AS platform_is_custom, p.created_at AS platform_created_at
     FROM accounts a
     LEFT JOIN platforms p ON p.id = a.platform_id
     ORDER BY a.name ASC`,
  );

  const tagRows = await db.select<{ account_id: number; id: number; name: string }[]>(
    `SELECT at.account_id AS account_id, t.id AS id, t.name AS name
     FROM account_tags at JOIN tags t ON t.id = at.tag_id`,
  );

  const tagsByAccount = new Map<number, Tag[]>();
  for (const row of tagRows) {
    const list = tagsByAccount.get(row.account_id) ?? [];
    list.push({ id: row.id, name: row.name });
    tagsByAccount.set(row.account_id, list);
  }

  return rows.map((row) => ({
    ...row,
    platform: row.platform_id
      ? {
          id: row.platform_id,
          name: row.platform_name ?? "",
          icon: row.platform_icon,
          login_url: row.platform_login_url,
          website_url: row.platform_website_url,
          is_custom: row.platform_is_custom ?? 0,
          created_at: row.platform_created_at ?? "",
        }
      : null,
    tags: tagsByAccount.get(row.id) ?? [],
  }));
}

export interface SaveAccountInput {
  name: string;
  platform_id: number | null;
  category: string | null;
  username: string | null;
  email: string | null;
  encrypted_password: string | null;
  login_url: string | null;
  website_url: string | null;
  notes: string | null;
  favorite: boolean;
  avatar_image_id: number | null;
  tagNames: string[];
}

export async function createAccount(input: SaveAccountInput): Promise<number> {
  const db = await getDb();
  const now = nowIso();
  const result = await db.execute(
    `INSERT INTO accounts
      (name, platform_id, category, username, email, encrypted_password, login_url, website_url, notes, favorite, avatar_image_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      input.name,
      input.platform_id,
      input.category,
      input.username,
      input.email,
      input.encrypted_password,
      input.login_url,
      input.website_url,
      input.notes,
      input.favorite ? 1 : 0,
      input.avatar_image_id,
      now,
      now,
    ],
  );
  const accountId = result.lastInsertId ?? 0;
  await syncAccountTags(accountId, input.tagNames);
  return accountId;
}

export async function updateAccount(id: number, input: SaveAccountInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE accounts SET
      name = $1, platform_id = $2, category = $3, username = $4, email = $5,
      encrypted_password = $6, login_url = $7, website_url = $8, notes = $9,
      favorite = $10, avatar_image_id = $11, updated_at = $12
     WHERE id = $13`,
    [
      input.name,
      input.platform_id,
      input.category,
      input.username,
      input.email,
      input.encrypted_password,
      input.login_url,
      input.website_url,
      input.notes,
      input.favorite ? 1 : 0,
      input.avatar_image_id,
      nowIso(),
      id,
    ],
  );
  await syncAccountTags(id, input.tagNames);
}

async function syncAccountTags(accountId: number, tagNames: string[]): Promise<void> {
  const db = await getDb();
  const tagIds = await ensureTagIds(tagNames);
  await db.execute("DELETE FROM account_tags WHERE account_id = $1", [accountId]);
  for (const tagId of tagIds) {
    await db.execute("INSERT OR IGNORE INTO account_tags (account_id, tag_id) VALUES ($1, $2)", [accountId, tagId]);
  }
}

export async function deleteAccount(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM accounts WHERE id = $1", [id]);
}

export async function toggleFavorite(id: number, favorite: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE accounts SET favorite = $1, updated_at = $2 WHERE id = $3", [
    favorite ? 1 : 0,
    nowIso(),
    id,
  ]);
}

// ---------- Settings ----------

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>("SELECT * FROM settings");
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2", [
    key,
    value,
  ]);
}

// ---------- Images ----------

export async function listImages(): Promise<ImageRecord[]> {
  const db = await getDb();
  return db.select<ImageRecord[]>("SELECT * FROM images ORDER BY created_at DESC");
}

export async function getImageById(id: number): Promise<ImageRecord | null> {
  const db = await getDb();
  const rows = await db.select<ImageRecord[]>("SELECT * FROM images WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function findImageByHash(hash: string): Promise<ImageRecord | null> {
  const db = await getDb();
  const rows = await db.select<ImageRecord[]>("SELECT * FROM images WHERE hash = $1", [hash]);
  return rows[0] ?? null;
}

export async function createImageRecord(filename: string, originalName: string, hash: string): Promise<ImageRecord> {
  const existing = await findImageByHash(hash);
  if (existing) return existing;

  const db = await getDb();
  const result = await db.execute("INSERT INTO images (filename, original_name, hash, created_at) VALUES ($1, $2, $3, $4)", [
    filename,
    originalName,
    hash,
    nowIso(),
  ]);
  return { id: result.lastInsertId ?? 0, filename, original_name: originalName, hash, created_at: nowIso() };
}

export async function deleteImageRecord(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM images WHERE id = $1", [id]);
}

export async function countAccountsUsingImage(imageId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM accounts WHERE avatar_image_id = $1", [
    imageId,
  ]);
  return rows[0]?.count ?? 0;
}

export async function clearAvatarForImage(imageId: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE accounts SET avatar_image_id = NULL WHERE avatar_image_id = $1", [imageId]);
}

// ---------- Security questions ----------

export async function listSecurityQuestions(): Promise<SecurityQuestion[]> {
  const db = await getDb();
  return db.select<SecurityQuestion[]>("SELECT id, question, share_index, created_at FROM security_questions ORDER BY created_at ASC");
}
