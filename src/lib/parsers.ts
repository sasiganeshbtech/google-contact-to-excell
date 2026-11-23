import type {
  ContactRecord,
  ParsedCsvPreview,
  StagedContact,
  TargetContactField,
} from '../types/contacts';

function makeId(prefix: string, idx: number): string {
  return `${prefix}_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : digits;
}

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? '';
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

export function parseCsvMatrix(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i += 1;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== '')) {
    rows.push(row);
  }
  return rows;
}

export function autoMapHeader(header: string): TargetContactField {
  const h = header.toLowerCase().trim();
  if (!h) return 'ignore';

  if (h === 'first name' || h === 'given name' || h === 'firstname' || h === 'first') {
    return 'firstName';
  }
  if (h === 'last name' || h === 'family name' || h === 'lastname' || h === 'surname' || h === 'last') {
    return 'lastName';
  }
  if (h === 'name' || h === 'full name' || h === 'display name' || h === 'contact name') {
    return 'fullName';
  }
  if (
    h.includes('e-mail 1 - value') ||
    h.includes('email 1 - value') ||
    h === 'email' ||
    h === 'e-mail' ||
    h === 'email address' ||
    h === 'e-mail address' ||
    h === 'primary email' ||
    h === 'work email'
  ) {
    return 'email';
  }
  if (
    h.includes('phone 1 - value') ||
    h === 'phone' ||
    h === 'phone number' ||
    h === 'mobile' ||
    h === 'mobile phone' ||
    h === 'cell' ||
    h === 'telephone'
  ) {
    return 'phone';
  }
  if (
    h === 'organization 1 - name' ||
    h === 'organization name' ||
    h === 'company' ||
    h === 'organization' ||
    h === 'employer' ||
    h === 'account'
  ) {
    return 'organization';
  }
  if (
    h === 'organization 1 - title' ||
    h === 'job title' ||
    h === 'title' ||
    h === 'role' ||
    h === 'position'
  ) {
    return 'jobTitle';
  }
  if (h === 'notes' || h === 'note' || h === 'comments' || h === 'description') {
    return 'notes';
  }

  return 'ignore';
}

export function buildCsvPreview(fileName: string, rawText: string): ParsedCsvPreview {
  const matrix = parseCsvMatrix(rawText);
  if (matrix.length === 0) {
    return { fileName, headers: [], rows: [], mapping: {} };
  }

  const headers = matrix[0];
  const rows = matrix.slice(1).filter((r) => r.some((cell) => cell.trim() !== ''));
  const mapping: Record<number, TargetContactField> = {};
  const usedTargets = new Set<TargetContactField>();

  headers.forEach((h, idx) => {
    const candidate = autoMapHeader(h);
    if (candidate !== 'ignore' && !usedTargets.has(candidate)) {
      mapping[idx] = candidate;
      usedTargets.add(candidate);
    } else {
      mapping[idx] = 'ignore';
    }
  });

  return { fileName, headers, rows, mapping };
}

export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function evaluateStagedContacts(
  drafts: Array<{
    id?: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    organization: string;
    jobTitle: string;
    notes: string;
    originLabel: string;
  }>,
  existingContacts: ContactRecord[]
): StagedContact[] {
  const emailIndex = new Map<string, ContactRecord>();
  const phoneIndex = new Map<string, ContactRecord>();

  for (const c of existingContacts) {
    if (c.email) emailIndex.set(c.email.toLowerCase().trim(), c);
    for (const extra of c.additionalEmails) {
      emailIndex.set(extra.toLowerCase().trim(), c);
    }
    if (c.phone) {
      const norm = normalizePhoneDigits(c.phone);
      if (norm.length >= 7) phoneIndex.set(norm, c);
    }
  }

  const seenEmailsInBatch = new Set<string>();

  return drafts.map((d, idx) => {
    let firstName = d.firstName.trim();
    let lastName = d.lastName.trim();
    let fullName = d.fullName.trim();

    if (!firstName && !lastName && fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ');
    } else if (!fullName && (firstName || lastName)) {
      fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    }

    const email = d.email.trim();
    const emailLower = email.toLowerCase();
    const phone = d.phone.trim();
    const phoneNorm = normalizePhoneDigits(phone);

    let status: StagedContact['status'] = 'new';
    let duplicateReason: string | undefined;
    let matchedContactName: string | undefined;
    let errorMessage: string | undefined;

    if (!fullName && !email && !phone) {
      status = 'invalid';
      errorMessage = 'Missing name, email, and phone';
    } else if (email && !isValidEmail(email)) {
      status = 'invalid';
      errorMessage = 'Invalid email format';
    } else if (!email && !phone) {
      status = 'invalid';
      errorMessage = 'Add an email or phone number';
    } else if (emailLower && emailIndex.has(emailLower)) {
      const match = emailIndex.get(emailLower)!;
      status = 'duplicate';
      duplicateReason = 'Email already in Google Contacts';
      matchedContactName = match.fullName;
    } else if (phoneNorm.length >= 7 && phoneIndex.has(phoneNorm)) {
      const match = phoneIndex.get(phoneNorm)!;
      status = 'duplicate';
      duplicateReason = 'Phone already in Google Contacts';
      matchedContactName = match.fullName;
    } else if (emailLower && seenEmailsInBatch.has(emailLower)) {
      status = 'duplicate';
      duplicateReason = 'Duplicate within import batch';
    }

    if (emailLower) seenEmailsInBatch.add(emailLower);

    return {
      id: d.id ?? makeId('stage', idx),
      firstName,
      lastName,
      fullName: fullName || email || phone,
      email,
      phone,
      organization: d.organization.trim(),
      jobTitle: d.jobTitle.trim(),
      notes: d.notes.trim(),
      selected: status === 'new',
      skipDuplicate: status === 'duplicate',
      status,
      duplicateReason,
      matchedContactName,
      errorMessage,
      originLabel: d.originLabel,
    };
  });
}

export function csvPreviewToStaged(
  preview: ParsedCsvPreview,
  existingContacts: ContactRecord[]
): StagedContact[] {
  const drafts = preview.rows.map((row) => {
    const draft = {
      firstName: '',
      lastName: '',
      fullName: '',
      email: '',
      phone: '',
      organization: '',
      jobTitle: '',
      notes: '',
      originLabel: preview.fileName,
    };

    Object.entries(preview.mapping).forEach(([colIdxStr, target]) => {
      if (target === 'ignore') return;
      const val = row[Number(colIdxStr)] ?? '';
      if (!val) return;
      if (!draft[target]) {
        draft[target] = val;
      }
    });

    return draft;
  });

  return evaluateStagedContacts(drafts, existingContacts);
}

export function parseVcardText(
  rawText: string,
  fileName: string,
  existingContacts: ContactRecord[]
): StagedContact[] {
  const unfolded = rawText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  const drafts: Array<{
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    organization: string;
    jobTitle: string;
    notes: string;
    originLabel: string;
  }> = [];

  for (const card of cards) {
    const lines = card.split(/\r?\n/);
    let firstName = '';
    let lastName = '';
    let fullName = '';
    let email = '';
    let phone = '';
    let organization = '';
    let jobTitle = '';
    let notes = '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || /^END:VCARD$/i.test(line)) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const propKey = line.slice(0, colonIdx).split(';')[0].toUpperCase();
      const val = line.slice(colonIdx + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();

      if (propKey === 'FN' && !fullName) {
        fullName = val;
      } else if (propKey === 'N') {
        const parts = val.split(';');
        lastName = parts[0]?.trim() ?? '';
        firstName = parts[1]?.trim() ?? '';
      } else if (propKey === 'EMAIL' && !email) {
        email = val;
      } else if (propKey === 'TEL' && !phone) {
        phone = val;
      } else if (propKey === 'ORG' && !organization) {
        organization = val.split(';')[0]?.trim() ?? '';
      } else if (propKey === 'TITLE' && !jobTitle) {
        jobTitle = val;
      } else if (propKey === 'NOTE' && !notes) {
        notes = val;
      }
    }

    if (fullName || firstName || lastName || email || phone) {
      drafts.push({
        firstName,
        lastName,
        fullName,
        email,
        phone,
        organization,
        jobTitle,
        notes,
        originLabel: fileName,
      });
    }
  }

  return evaluateStagedContacts(drafts, existingContacts);
}

export function parseFreeformEmailText(
  rawText: string,
  existingContacts: ContactRecord[]
): StagedContact[] {
  const chunks = rawText
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const drafts: Array<{
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    organization: string;
    jobTitle: string;
    notes: string;
    originLabel: string;
  }> = [];

  for (const chunk of chunks) {
    const angle = chunk.match(/^(.*?)<([^<>\s]+@[^<>\s]+)>$/);
    if (angle) {
      const name = angle[1].trim().replace(/^["']|["']$/g, '');
      const email = angle[2].trim();
      drafts.push({
        firstName: '',
        lastName: '',
        fullName: name,
        email,
        phone: '',
        organization: '',
        jobTitle: '',
        notes: '',
        originLabel: 'Pasted List',
      });
      continue;
    }

    const emailMatch = chunk.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      const email = emailMatch[0];
      const remainder = chunk.replace(email, '').replace(/[<>()"]/g, '').trim();
      drafts.push({
        firstName: '',
        lastName: '',
        fullName: remainder,
        email,
        phone: '',
        organization: '',
        jobTitle: '',
        notes: '',
        originLabel: 'Pasted List',
      });
    }
  }

  return evaluateStagedContacts(drafts, existingContacts);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportContactsToGoogleCsv(contacts: ContactRecord[]): string {
  const headers = [
    'Name',
    'Given Name',
    'Family Name',
    'E-mail 1 - Type',
    'E-mail 1 - Value',
    'Phone 1 - Type',
    'Phone 1 - Value',
    'Organization 1 - Name',
    'Organization 1 - Title',
    'Notes',
  ];
  const lines = [headers.map(csvEscape).join(',')];
  for (const c of contacts) {
    lines.push(
      [
        c.fullName,
        c.firstName,
        c.lastName,
        c.email ? 'Work' : '',
        c.email,
        c.phone ? 'Mobile' : '',
        c.phone,
        c.organization,
        c.jobTitle,
        c.notes,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

export function exportContactsToVcard(contacts: ContactRecord[]): string {
  return contacts
    .map((c) => {
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${c.fullName}`,
        `N:${c.lastName};${c.firstName};;;`,
      ];
      if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${c.email}`);
      if (c.phone) lines.push(`TEL;TYPE=CELL:${c.phone}`);
      if (c.organization) lines.push(`ORG:${c.organization}`);
      if (c.jobTitle) lines.push(`TITLE:${c.jobTitle}`);
      if (c.notes) lines.push(`NOTE:${c.notes.replace(/\n/g, '\\n')}`);
      lines.push('END:VCARD');
      return lines.join('\r\n');
    })
    .join('\r\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const SAMPLE_IMPORT_CSV = `First Name,Last Name,Email Address,Phone Number,Company,Job Title,Notes
Elena,Rostova,elena.rostova@northstar-labs.io,+1-415-555-0142,Northstar Labs,VP Engineering,Met at Cloud Summit
Marcus,Vance,marcus@vanceatelier.com,+1-212-555-0198,Vance Atelier,Creative Director,Q4 newsletter partner
Priya,Nair,priya.nair@meridianhealth.org,+1-650-555-0174,Meridian Health,Product Lead,Requested product demo
`;
