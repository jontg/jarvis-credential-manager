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

  for (const field of item.fields) {
    if (field.fieldType === ItemFieldType.Concealed && !credential) {
      credential = field.value;
    }
    if (scope && field.title.toLowerCase().includes(scope.toLowerCase())) {
      fields[field.title] = field.value;
    }
  }

  if (!credential) throw new Error(`No credential found for service: ${service}`);

  return { credential, fields };
}
