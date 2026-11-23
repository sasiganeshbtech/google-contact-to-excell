import React, { useEffect, useState } from 'react';
import { Trash2, UserPlus, X } from 'lucide-react';
import type { ContactGroup, ContactRecord } from '../types/contacts';

interface ContactDetailDrawerProps {
  contact: ContactRecord | null;
  groups: ContactGroup[];
  onClose: () => void;
  onRequestSave: (
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
  ) => void;
  onRequestDelete: (contact: ContactRecord) => void;
  onRequestPromote?: (contact: ContactRecord) => void;
}

export const ContactDetailDrawer: React.FC<ContactDetailDrawerProps> = ({
  contact,
  groups,
  onClose,
  onRequestSave,
  onRequestDelete,
  onRequestPromote,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!contact) return;
    setFirstName(contact.firstName);
    setLastName(contact.lastName);
    setEmail(contact.email);
    setPhone(contact.phone);
    setOrganization(contact.organization);
    setJobTitle(contact.jobTitle);
    setNotes(contact.notes);
  }, [contact]);

  useEffect(() => {
    if (!contact) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contact, onClose]);

  if (!contact) return null;

  const isSaved = contact.source === 'saved';
  const groupNames = contact.groupResourceNames
    .map((rn) => groups.find((g) => g.resourceName === rn)?.formattedName)
    .filter((v): v is string => Boolean(v));

  const initials = contact.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Contact details for ${contact.fullName}`}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {contact.photoUrl ? (
              <img
                src={contact.photoUrl}
                alt={contact.fullName}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-display text-sm font-semibold text-slate-700 border border-slate-200">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate font-display text-base font-semibold text-slate-900">
                {contact.fullName}
              </h2>
              <p className="truncate text-xs text-slate-500">
                {isSaved ? 'Saved Google Contact' : 'Gmail Auto-Saved Contact'}
                {groupNames.length > 0 ? ` · ${groupNames.join(', ')}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onRequestSave(contact, {
              firstName,
              lastName,
              email,
              phone,
              organization,
              jobTitle,
              notes,
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                First name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={!isSaved}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Last name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={!isSaved}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Primary email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isSaved}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            {contact.additionalEmails.length > 0 && (
              <p className="mt-1 text-xs text-slate-500 font-mono">
                Also: {contact.additionalEmails.join(', ')}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Phone number
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!isSaved}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Company
              </label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                disabled={!isSaved}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Job title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={!isSaved}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Notes
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isSaved}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            {isSaved ? (
              <>
                <button
                  type="button"
                  onClick={() => onRequestDelete(contact)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Contact
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
                >
                  Save Changes
                </button>
              </>
            ) : (
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  Other contacts are read-only until promoted.
                </span>
                {onRequestPromote && (
                  <button
                    type="button"
                    onClick={() => onRequestPromote(contact)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Save to Contacts
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
};
