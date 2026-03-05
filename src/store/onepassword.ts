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
    // Skip empty values
    if (!field.value) continue;

    // Collect concealed field as fallback primary credential
    if (field.fieldType === ItemFieldType.Concealed && !credential) {
      credential = field.value;
    }

    // If scope terms provided, match any term against field title
    if (scopeTerms.length > 0) {
      const titleLower = field.title.toLowerCase();
      if (scopeTerms.some((term) => titleLower.includes(term))) {
        fields[field.title] = field.value;
      }
    } else {
      // No scope specified — return all non-empty fields
      fields[field.title] = field.value;
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
