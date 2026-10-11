export interface User {
  id: string;
  name: string;
  email: string;
}

export type Role = 'owner' | 'viewer';

export interface Share {
  user_id: string;
  name: string;
  email: string;
  permission: 'viewer';
}

export interface DocContent {
  type: 'doc';
  content?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface DocumentSummary {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail extends DocumentSummary {
  content: DocContent;
}
