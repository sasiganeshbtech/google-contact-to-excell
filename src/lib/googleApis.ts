import type {
  ContactGroup,
  ContactRecord,
  GmailDiscoveredContact,
  StagedContact,
} from '../types/contacts';

interface GooglePerson {
  resourceName: string;
  etag?: string;
  names?: Array<{
    displayName?: string;
    givenName?: string;
    familyName?: string;
  }>;
  emailAddresses?: Array<{ value?: string; type?: string }>;
  phoneNumbers?: Array<{ value?: string; type?: string }>;
  organizations?: Array<{ name?: string; title?: string }>;
  biographies?: Array<{ value?: string }>;
  photos?: Array<{ url?: string; default?: boolean }>;
  memberships?: Array<{
    contactGroupMembership?: {
      contactGroupId?: string;
      contactGroupResourceName?: string;
    };
  }>;
}

export class GoogleApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function googleFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        message = errJson.error.message;
      }
    } catch {
      // ignore json parse failure
    }
    throw new GoogleApiError(message, res.status);
  }

  if (res.status === 204) {
    return {} as T;
  }
  return (await res.json()) as T;
}

function mapPersonToContact(person: GooglePerson, source: 'saved' | 'other'): ContactRecord {
  const primaryName = person.names?.[0];
  const firstName = primaryName?.givenName?.trim() ?? '';
  const lastName = primaryName?.familyName?.trim() ?? '';
  const emails = (person.emailAddresses ?? [])
    .map((e) => e.value?.trim() ?? '')
    .filter(Boolean);
  const phones = (person.phoneNumbers ?? [])
    .map((p) => p.value?.trim() ?? '')
    .filter(Boolean);
  const org = person.organizations?.[0];
  const photo = person.photos?.find((p) => !p.default)?.url ?? person.photos?.[0]?.url;
  const fullName =
    primaryName?.displayName?.trim() ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    emails[0] ||
    phones[0] ||
    'Unnamed Contact';

  const groupResourceNames = (person.memberships ?? [])
    .map((m) => m.contactGroupMembership?.contactGroupResourceName)
    .filter((v): v is string => Boolean(v));

  return {
    id: person.resourceName,
    resourceName: person.resourceName,
    etag: person.etag,
    firstName,
    lastName,
    fullName,
    email: emails[0] ?? '',
    additionalEmails: emails.slice(1),
    phone: phones[0] ?? '',
    additionalPhones: phones.slice(1),
    organization: org?.name?.trim() ?? '',
    jobTitle: org?.title?.trim() ?? '',
    notes: person.biographies?.[0]?.value?.trim() ?? '',
    photoUrl: photo,
    groupResourceNames,
    source,
  };
}

export async function fetchSavedContacts(accessToken: string): Promise<ContactRecord[]> {
  const all: ContactRecord[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers,organizations,biographies,photos,memberships',
      pageSize: '500',
      sortOrder: 'FIRST_NAME_ASCENDING',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await googleFetch<{
      connections?: GooglePerson[];
      nextPageToken?: string;
    }>(`https://people.googleapis.com/v1/people/me/connections?${params.toString()}`, accessToken);

    for (const person of data.connections ?? []) {
      all.push(mapPersonToContact(person, 'saved'));
    }
    pageToken = data.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 5);

  return all;
}

export async function fetchOtherContacts(accessToken: string): Promise<ContactRecord[]> {
  const all: ContactRecord[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      readMask: 'names,emailAddresses,phoneNumbers,photos',
      pageSize: '500',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await googleFetch<{
      otherContacts?: GooglePerson[];
      nextPageToken?: string;
    }>(`https://people.googleapis.com/v1/otherContacts?${params.toString()}`, accessToken);

    for (const person of data.otherContacts ?? []) {
      all.push(mapPersonToContact(person, 'other'));
    }
    pageToken = data.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 5);

  return all;
}

export async function fetchContactGroups(accessToken: string): Promise<ContactGroup[]> {
  const data = await googleFetch<{
    contactGroups?: Array<{
      resourceName: string;
      name: string;
      formattedName?: string;
      groupType: string;
      memberCount?: number;
    }>;
  }>('https://people.googleapis.com/v1/contactGroups?pageSize=200', accessToken);

  return (data.contactGroups ?? [])
    .filter((g) => g.groupType === 'USER_CONTACT_GROUP' || g.resourceName === 'contactGroups/myContacts')
    .map((g) => ({
      resourceName: g.resourceName,
      name: g.name,
      formattedName: g.formattedName ?? g.name,
      groupType: g.groupType,
      memberCount: g.memberCount ?? 0,
    }));
}

export async function createContactGroup(
  accessToken: string,
  name: string
): Promise<ContactGroup> {
  const created = await googleFetch<{
    resourceName: string;
    name: string;
    formattedName?: string;
    groupType: string;
    memberCount?: number;
  }>('https://people.googleapis.com/v1/contactGroups', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      contactGroup: { name: name.trim() },
    }),
  });

  return {
    resourceName: created.resourceName,
    name: created.name,
    formattedName: created.formattedName ?? created.name,
    groupType: created.groupType,
    memberCount: created.memberCount ?? 0,
  };
}

function buildPersonPayload(contact: Pick<StagedContact, 'firstName' | 'lastName' | 'fullName' | 'email' | 'phone' | 'organization' | 'jobTitle' | 'notes'>) {
  let givenName = contact.firstName.trim();
  let familyName = contact.lastName.trim();
  if (!givenName && !familyName && contact.fullName.trim()) {
    const parts = contact.fullName.trim().split(/\s+/);
    givenName = parts[0] ?? '';
    familyName = parts.slice(1).join(' ');
  }

  const payload: Record<string, unknown> = {};
  if (givenName || familyName) {
    payload.names = [{ givenName, familyName }];
  }
  if (contact.email.trim()) {
    payload.emailAddresses = [{ value: contact.email.trim(), type: 'work' }];
  }
  if (contact.phone.trim()) {
    payload.phoneNumbers = [{ value: contact.phone.trim(), type: 'mobile' }];
  }
  if (contact.organization.trim() || contact.jobTitle.trim()) {
    payload.organizations = [
      {
        name: contact.organization.trim() || undefined,
        title: contact.jobTitle.trim() || undefined,
      },
    ];
  }
  if (contact.notes.trim()) {
    payload.biographies = [{ value: contact.notes.trim(), contentType: 'TEXT_PLAIN' }];
  }
  return payload;
}

export async function batchCreateContacts(
  accessToken: string,
  contacts: StagedContact[],
  groupResourceName?: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{
  created: ContactRecord[];
  results: Array<{ stagedId: string; ok: boolean; error?: string; resourceName?: string }>;
}> {
  const BATCH_SIZE = 100;
  const created: ContactRecord[] = [];
  const results: Array<{ stagedId: string; ok: boolean; error?: string; resourceName?: string }> = [];
  const createdResourceNames: string[] = [];

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const chunk = contacts.slice(i, i + BATCH_SIZE);
    const body = {
      contacts: chunk.map((c) => ({
        contactPerson: buildPersonPayload(c),
      })),
      readMask: 'names,emailAddresses,phoneNumbers,organizations,biographies,photos,memberships',
    };

    const response = await googleFetch<{
      createdPeople?: Array<{
        httpStatusCode?: number;
        status?: { message?: string };
        person?: GooglePerson;
      }>;
    }>('https://people.googleapis.com/v1/people:batchCreateContacts', accessToken, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const createdPeople = response.createdPeople ?? [];
    chunk.forEach((staged, idx) => {
      const item = createdPeople[idx];
      if (item?.person && (!item.httpStatusCode || item.httpStatusCode < 300)) {
        const mapped = mapPersonToContact(item.person, 'saved');
        created.push(mapped);
        createdResourceNames.push(mapped.resourceName);
        results.push({ stagedId: staged.id, ok: true, resourceName: mapped.resourceName });
      } else {
        results.push({
          stagedId: staged.id,
          ok: false,
          error: item?.status?.message ?? 'Failed to create contact',
        });
      }
    });

    onProgress?.(Math.min(i + chunk.length, contacts.length), contacts.length);
  }

  if (
    groupResourceName &&
    groupResourceName !== 'contactGroups/myContacts' &&
    createdResourceNames.length > 0
  ) {
    for (let i = 0; i < createdResourceNames.length; i += 500) {
      const slice = createdResourceNames.slice(i, i + 500);
      await googleFetch(`https://people.googleapis.com/v1/${groupResourceName}/members:modify`, accessToken, {
        method: 'POST',
        body: JSON.stringify({
          resourceNamesToAdd: slice,
        }),
      });
    }
  }

  return { created, results };
}

export async function updateGoogleContact(
  accessToken: string,
  contact: ContactRecord,
  patch: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    organization: string;
    jobTitle: string;
    notes: string;
  }
): Promise<ContactRecord> {
  const updateBody: Record<string, unknown> = {
    etag: contact.etag,
    names: [{ givenName: patch.firstName.trim(), familyName: patch.lastName.trim() }],
    emailAddresses: patch.email.trim() ? [{ value: patch.email.trim(), type: 'work' }] : [],
    phoneNumbers: patch.phone.trim() ? [{ value: patch.phone.trim(), type: 'mobile' }] : [],
    organizations:
      patch.organization.trim() || patch.jobTitle.trim()
        ? [{ name: patch.organization.trim(), title: patch.jobTitle.trim() }]
        : [],
    biographies: patch.notes.trim()
      ? [{ value: patch.notes.trim(), contentType: 'TEXT_PLAIN' }]
      : [],
  };

  const updated = await googleFetch<GooglePerson>(
    `https://people.googleapis.com/v1/${contact.resourceName}:updateContact?updatePersonFields=names,emailAddresses,phoneNumbers,organizations,biographies`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(updateBody),
    }
  );

  return mapPersonToContact(updated, 'saved');
}

export async function deleteGoogleContact(
  accessToken: string,
  resourceName: string
): Promise<void> {
  await googleFetch(
    `https://people.googleapis.com/v1/${resourceName}:deleteContact`,
    accessToken,
    { method: 'DELETE' }
  );
}

export async function promoteOtherContact(
  accessToken: string,
  resourceName: string
): Promise<ContactRecord> {
  const promoted = await googleFetch<GooglePerson>(
    `https://people.googleapis.com/v1/${resourceName}:copyOtherContactToMyContactsGroup`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        copyMask: 'names,emailAddresses,phoneNumbers',
      }),
    }
  );
  return mapPersonToContact(promoted, 'saved');
}

function parseEmailHeaderList(headerValue: string): Array<{ name: string; email: string }> {
  if (!headerValue) return [];
  const entries: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < headerValue.length; i += 1) {
    const ch = headerValue[i];
    if (ch === '"' && headerValue[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === ',' && !inQuotes) {
      if (current.trim()) entries.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) entries.push(current.trim());

  const parsed: Array<{ name: string; email: string }> = [];
  for (const entry of entries) {
    const angleMatch = entry.match(/^(.*?)<([^<>\s]+@[^<>\s]+)>$/);
    if (angleMatch) {
      const rawName = angleMatch[1].trim().replace(/^["']|["']$/g, '').trim();
      const email = angleMatch[2].trim().toLowerCase();
      parsed.push({ name: rawName, email });
    } else {
      const plainMatch = entry.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (plainMatch) {
        parsed.push({ name: '', email: plainMatch[0].toLowerCase() });
      }
    }
  }
  return parsed;
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function scanGmailCorrespondents(
  accessToken: string,
  userEmail: string | null | undefined,
  savedEmails: Set<string>,
  otherEmails: Set<string>,
  onProgress?: (scanned: number, total: number) => void
): Promise<GmailDiscoveredContact[]> {
  const listData = await googleFetch<{
    messages?: Array<{ id: string }>;
  }>('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=60', accessToken);

  const messageIds = (listData.messages ?? []).map((m) => m.id);
  if (messageIds.length === 0) return [];

  const selfEmail = (userEmail ?? '').toLowerCase().trim();
  const map = new Map<
    string,
    {
      name: string;
      email: string;
      messageCount: number;
      lastSeenMs: number;
      lastSeenIso: string;
      lastSubject: string;
      roles: Set<'From' | 'To' | 'Cc'>;
    }
  >();

  const CONCURRENCY = 10;
  let completed = 0;

  for (let i = 0; i < messageIds.length; i += CONCURRENCY) {
    const batch = messageIds.slice(i, i + CONCURRENCY);
    const messages = await Promise.all(
      batch.map((id) =>
        googleFetch<{
          internalDate?: string;
          payload?: {
            headers?: Array<{ name: string; value: string }>;
          };
        }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date&metadataHeaders=Subject`,
          accessToken
        ).catch(() => null)
      )
    );

    for (const msg of messages) {
      if (!msg) continue;
      const headers = msg.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

      const subject = getHeader('Subject') || '(No subject)';
      const dateStr = getHeader('Date');
      const ms = msg.internalDate ? Number(msg.internalDate) : Date.parse(dateStr) || Date.now();
      const iso = new Date(ms).toISOString();

      const headerRoles: Array<{ role: 'From' | 'To' | 'Cc'; value: string }> = [
        { role: 'From', value: getHeader('From') },
        { role: 'To', value: getHeader('To') },
        { role: 'Cc', value: getHeader('Cc') },
      ];

      for (const hr of headerRoles) {
        for (const person of parseEmailHeaderList(hr.value)) {
          if (!person.email || person.email === selfEmail) continue;
          if (person.email.includes('noreply') || person.email.includes('no-reply') || person.email.includes('mailer-daemon')) {
            continue;
          }

          const existing = map.get(person.email);
          if (!existing) {
            map.set(person.email, {
              name: person.name,
              email: person.email,
              messageCount: 1,
              lastSeenMs: ms,
              lastSeenIso: iso,
              lastSubject: subject,
              roles: new Set([hr.role]),
            });
          } else {
            existing.messageCount += 1;
            existing.roles.add(hr.role);
            if (!existing.name && person.name) {
              existing.name = person.name;
            }
            if (ms > existing.lastSeenMs) {
              existing.lastSeenMs = ms;
              existing.lastSeenIso = iso;
              existing.lastSubject = subject;
            }
          }
        }
      }
    }

    completed += batch.length;
    onProgress?.(completed, messageIds.length);
  }

  return Array.from(map.values())
    .sort((a, b) => b.messageCount - a.messageCount || b.lastSeenMs - a.lastSeenMs)
    .map((item) => {
      const savedStatus: 'unsaved' | 'other' | 'saved' = savedEmails.has(item.email)
        ? 'saved'
        : otherEmails.has(item.email)
          ? 'other'
          : 'unsaved';

      return {
        id: item.email,
        name: item.name || item.email.split('@')[0],
        email: item.email,
        messageCount: item.messageCount,
        lastSeenIso: item.lastSeenIso,
        lastSeenDisplay: formatShortDate(item.lastSeenIso),
        lastSubject: item.lastSubject,
        roles: Array.from(item.roles),
        savedStatus,
        selected: savedStatus === 'unsaved',
      };
    });
}
