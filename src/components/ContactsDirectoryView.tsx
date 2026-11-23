import React, { useMemo, useState } from 'react';
import { BookUser, Download, Search, UserPlus } from 'lucide-react';
import type { ContactGroup, ContactRecord } from '../types/contacts';
import {
  downloadTextFile,
  exportContactsToGoogleCsv,
  exportContactsToVcard,
} from '../lib/parsers';

interface ContactsDirectoryViewProps {
  mode: 'saved' | 'other';
  contacts: ContactRecord[];
  groups: ContactGroup[];
  isLoading: boolean;
  onInspectContact: (contact: ContactRecord) => void;
  onRequestPromoteOther?: (contactsToPromote: ContactRecord[]) => void;
  onGoToImport?: () => void;
}

export const ContactsDirectoryView: React.FC<ContactsDirectoryViewProps> = ({
  mode,
  contacts,
  groups,
  isLoading,
  onInspectContact,
  onRequestPromoteOther,
  onGoToImport,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const userGroups = useMemo(
    () => groups.filter((g) => g.resourceName !== 'contactGroups/myContacts'),
    [groups]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((c) => {
      if (mode === 'saved' && selectedGroup !== 'all') {
        if (!c.groupResourceNames.includes(selectedGroup)) return false;
      }
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.organization.toLowerCase().includes(q)
      );
    });
  }, [contacts, mode, selectedGroup, searchQuery]);

  const selectedContacts = useMemo(
    () => filtered.filter((c) => selectedIds.has(c.id)),
    [filtered, selectedIds]
  );

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const allChecked = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        filtered.forEach((c) => next.delete(c.id));
      } else {
        filtered.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const exportTarget = selectedContacts.length > 0 ? selectedContacts : filtered;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            {mode === 'saved' ? 'Saved Google Contacts' : 'Gmail Other Contacts'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {mode === 'saved'
              ? `${contacts.length} synced contacts · Click any row to edit or remove`
              : `${contacts.length} contacts automatically remembered from Gmail emails`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={exportTarget.length === 0}
            onClick={() =>
              downloadTextFile(
                `google-contacts-${mode}.csv`,
                exportContactsToGoogleCsv(exportTarget),
                'text/csv;charset=utf-8;'
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV {selectedContacts.length > 0 ? `(${selectedContacts.length})` : ''}
          </button>

          <button
            type="button"
            disabled={exportTarget.length === 0}
            onClick={() =>
              downloadTextFile(
                `google-contacts-${mode}.vcf`,
                exportContactsToVcard(exportTarget),
                'text/vcard;charset=utf-8;'
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export vCard
          </button>

          {mode === 'other' && onRequestPromoteOther && (
            <button
              type="button"
              disabled={selectedContacts.length === 0}
              onClick={() => onRequestPromoteOther(selectedContacts)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Save {selectedContacts.length > 0 ? `${selectedContacts.length} ` : ''}to Contacts
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-6 py-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, phone, or company..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        {mode === 'saved' && userGroups.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="directory-group-filter" className="text-xs font-medium text-slate-600">
              Label:
            </label>
            <select
              id="directory-group-filter"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All Labels ({contacts.length})</option>
              {userGroups.map((g) => (
                <option key={g.resourceName} value={g.resourceName}>
                  {g.formattedName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* States */}
      {isLoading ? (
        <div className="divide-y divide-slate-200">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-4 px-6 py-3">
              <div className="h-4 w-4 rounded bg-slate-200 animate-pulse" />
              <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
              <div className="h-4 w-52 rounded bg-slate-100 animate-pulse" />
              <div className="ml-auto h-4 w-28 rounded bg-slate-100 animate-pulse" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <BookUser className="mb-3 h-9 w-9 text-slate-300" />
          <p className="text-sm font-medium text-slate-800">
            {contacts.length === 0
              ? mode === 'saved'
                ? 'No saved contacts found in this Google account'
                : 'No auto-saved Other Contacts found'
              : 'No contacts match your search'}
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            {contacts.length === 0 && mode === 'saved'
              ? 'Import a CSV, vCard, or Gmail correspondent list to populate your Google Contacts.'
              : 'Try adjusting your search keywords or label filter.'}
          </p>
          {contacts.length === 0 && mode === 'saved' && onGoToImport && (
            <button
              type="button"
              onClick={onGoToImport}
              className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              Import First Contacts
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all visible contacts"
                    checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                </th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-4 py-2.5">Company &amp; Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((contact) => {
                const initials =
                  contact.fullName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? '')
                    .join('') || '?';

                return (
                  <tr
                    key={contact.id}
                    onClick={() => onInspectContact(contact)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${contact.fullName}`}
                        checked={selectedIds.has(contact.id)}
                        onChange={() => toggleRow(contact.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        {contact.photoUrl ? (
                          <img
                            src={contact.photoUrl}
                            alt={contact.fullName}
                            referrerPolicy="no-referrer"
                            className="h-7 w-7 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700 border border-slate-200">
                            {initials}
                          </div>
                        )}
                        <span className="font-medium text-slate-900">{contact.fullName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                      {contact.email || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {contact.phone || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                      {contact.organization || contact.jobTitle ? (
                        <span>
                          {[contact.organization, contact.jobTitle].filter(Boolean).join(' · ')}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
