export interface CredentialRequest {
  service: string;
  scope: string;
  reason: string;
}

export interface CredentialResponse {
  approved: boolean;
  credential?: string;
  fields?: Record<string, string>;
  expiresIn?: number;
  error?: string;
}

export interface PendingRequest {
  id: string;
  service: string;
  scope: string;
  reason: string;
  createdAt: number;
  resolve: (response: CredentialResponse) => void;
  reject: (error: Error) => void;
}
