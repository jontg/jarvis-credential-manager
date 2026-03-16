import { execSync } from 'child_process';
import { createClient, type Client, ItemFieldType } from '@1password/sdk';

let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (!client) {
    const token = process.env.OP_SERVICE_ACCOUNT_TOKEN;
    if (!token) throw new Error('OP_SERVICE_ACCOUNT_TOKEN not configured');
    client = await createClient({
      auth: token,
      integrationName: 'jarvis-credential-manager',
      integrationVersion: '0.1.0',
    });
  }
  return client;
}

/**
 * Fetch a single field value via the `op` CLI.
 * Used as a fallback for field types the SDK marks as Unsupported (e.g. MonthYear / expiry dates).
 */
function fetchFieldViaCli(itemId: string, vaultId: string, fieldTitle: string): string {
  try {
    const token = process.env.OP_SERVICE_ACCOUNT_TOKEN ?? '';
    const result = execSync(
      `op item get ${itemId} --vault ${vaultId} --fields ${JSON.stringify(fieldTitle)}`,
      {
        env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    return result.trim();
  } catch {
    return '';
  }
}

export type StoreAction = 'created' | 'updated';

/**
 * Write (create or update) a 1Password Login item by title.
 * Returns 'created' if a new item was made, 'updated' if an existing one was patched.
 * Never logs field values — only field names.
 */
export async function storeCredential(
  service: string,
  fields: Record<string, string>,
  vaultOverride?: string,
): Promise<StoreAction> {
  const vaultId = vaultOverride ?? process.env.OP_VAULT_ID;
  if (!vaultId) throw new Error('OP_VAULT_ID not configured');

  const op = await getClient();
  const items = await op.items.listAll(vaultId);

  let existingId: string | null = null;
  for await (const item of items) {
    if (item.title.toLowerCase() === service.toLowerCase()) {
      existingId = item.id;
      break;
    }
  }

  if (existingId) {
    // Update: fetch existing item, patch the specified fields
    const existing = await op.items.get(vaultId, existingId);
    for (const field of existing.fields) {
      if (field.title && Object.prototype.hasOwnProperty.call(fields, field.title)) {
        field.value = fields[field.title];
      }
    }
    // Add any fields that don't already exist
    const existingTitles = new Set(existing.fields.map((f) => f.title?.toLowerCase()));
    for (const [title, value] of Object.entries(fields)) {
      if (!existingTitles.has(title.toLowerCase())) {
        existing.fields.push({ title, value, fieldType: ItemFieldType.Text } as never);
      }
    }
    await op.items.put(existing);
    return 'updated';
  } else {
    // Create: build a new Login item
    const newItem = {
      title: service,
      vaultId,
      category: 'Login' as const,
      fields: Object.entries(fields).map(([title, value]) => ({
        title,
        value,
        fieldType: title.toLowerCase() === 'password' ? ItemFieldType.Concealed : ItemFieldType.Text,
      })),
    };
    await op.items.create(newItem as never);
    return 'created';
  }
}

export interface FetchedCredential {
  credential: string;
  fields: Record<string, string>;
}

export async function fetchCredential(
  service: string,
  scope: string,
): Promise<FetchedCredential> {
  const vaultId = process.env.OP_VAULT_ID;
  if (!vaultId) throw new Error('OP_VAULT_ID not configured');

  const op = await getClient();
  const items = await op.items.listAll(vaultId);

  let itemId: string | null = null;
  for await (const item of items) {
    if (item.title.toLowerCase() === service.toLowerCase()) {
      itemId = item.id;
      break;
    }
  }

  if (!itemId) throw new Error(`No 1Password item found for service: ${service}`);

  const item = await op.items.get(vaultId, itemId);
  let credential = '';
  const fields: Record<string, string> = {};

  // Parse scope as comma-separated terms for multi-field lookups
  const scopeTerms = scope
    ? scope.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  for (const field of item.fields) {
    // The @1password/sdk marks some field types (e.g. MonthYear for credit card expiry) as
    // `Unsupported` and returns an empty value. Fall back to the `op` CLI for those.
    let value = field.value;
    if (!value && field.fieldType === ItemFieldType.Unsupported && field.title) {
      value = fetchFieldViaCli(itemId, vaultId, field.title);
    }

    // Skip still-empty values
    if (!value) continue;

    // Collect concealed field as fallback primary credential
    if (field.fieldType === ItemFieldType.Concealed && !credential) {
      credential = value;
    }

    // If scope terms provided, match any term against field title
    if (scopeTerms.length > 0) {
      const titleLower = field.title.toLowerCase();
      if (scopeTerms.some((term) => titleLower.includes(term))) {
        fields[field.title] = value;
      }
    } else {
      // No scope specified — return all non-empty fields
      fields[field.title] = value;
    }
  }

  // If specific fields were requested and found, use the first matched value as credential
  const matchedValues = Object.values(fields);
  if (matchedValues.length > 0 && !scopeTerms.some((t) => t === 'cvv' || t === 'password')) {
    credential = matchedValues[0];
  }

  if (!credential && matchedValues.length === 0) {
    throw new Error(`No credential found for service: ${service}`);
  }

  return { credential, fields };
}
