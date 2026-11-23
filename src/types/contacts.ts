export type WorkspaceTab = 'import' | 'discover' | 'saved' | 'other';

export interface ContactRecord {
  id: string;
  resourceName: string;
  etag?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  additionalEmails: string[];
  phone: string;
  additionalPhones: string[];
  organization: string;
  jobTitle: string;
  notes: string;
  photoUrl?: string;
  groupResourceNames: string[];
  source: 'saved' | 'other';
}

export type StagedContactStatus = 'new' | 'duplicate' | 'invalid' | 'imported' | 'failed';

export interface StagedContact {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  jobTitle: string;
  notes: string;
  selected: boolean;
  skipDuplicate: boolean;
  status: StagedContactStatus;
  duplicateReason?: string;
  matchedContactName?: string;
  errorMessage?: string;
  originLabel: string;
}

export interface ContactGroup {
  resourceName: string;
  name: string;
  formattedName: string;
  groupType: string;
  memberCount: number;
}

export interface GmailDiscoveredContact {
  id: string;
  name: string;
  email: string;
  messageCount: number;
  lastSeenIso: string;
  lastSeenDisplay: string;
  lastSubject: string;
  roles: Array<'From' | 'To' | 'Cc'>;
  savedStatus: 'unsaved' | 'other' | 'saved';
  selected: boolean;
}

export type TargetContactField =
  | 'ignore'
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'organization'
  | 'jobTitle'
  | 'notes';

export interface ParsedCsvPreview {
  fileName: string;
  headers: string[];
  rows: string[][];
  mapping: Record<number, TargetContactField>;
}

export interface ConfirmModalConfig {
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  tone: 'primary' | 'danger';
  onConfirm: () => Promise<void> | void;
}
