import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BookUser,
  CheckCircle2,
  LogOut,
  MailSearch,
  Menu,
  RefreshCw,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  clearCachedToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './lib/googleAuth';
import {
  batchCreateContacts,
  createContactGroup,
  deleteGoogleContact,
  fetchContactGroups,
  fetchOtherContacts,
  fetchSavedContacts,
  GoogleApiError,
  promoteOtherContact,
  scanGmailCorrespondents,
  updateGoogleContact,
} from './lib/googleApis';
import { evaluateStagedContacts } from './lib/parsers';
import type {
  ConfirmModalConfig,
  ContactGroup,
  ContactRecord,
  GmailDiscoveredContact,
  StagedContact,
  WorkspaceTab,
} from './types/contacts';
import { SignInScreen } from './components/SignInScreen';
import { ImportStudioView } from './components/ImportStudioView';
import { GmailDiscoverView } from './components/GmailDiscoverView';
import { ContactsDirectoryView } from './components/ContactsDirectoryView';
import { ContactDetailDrawer } from './components/ContactDetailDrawer';
import { ConfirmActionModal } from './components/ConfirmActionModal';

const TAB_LABELS: Record<WorkspaceTab, string> = {
  import: 'Import Contacts',
  discover: 'Discover from Gmail',
  saved: 'Saved Contacts',
  other: 'Other Contacts',
};

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('import');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [savedContacts, setSavedContacts] = useState<ContactRecord[]>([]);
  const [otherContacts, setOtherContacts] = useState<ContactRecord[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [stagedContacts, setStagedContacts] = useState<StagedContact[]>([]);
  const [selectedGroupRn, setSelectedGroupRn] = useState<string>('contactGroups/myContacts');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(
    null
  );

  const [discovered, setDiscovered] = useState<GmailDiscoveredContact[]>([]);
  const [isScanningGmail, setIsScanningGmail] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ scanned: number; total: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [inspectedContact, setInspectedContact] = useState<ContactRecord | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalConfig | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const handleApiError = useCallback((err: unknown, fallbackMessage: string) => {
    if (err instanceof GoogleApiError && err.status === 401) {
      clearCachedToken();
      setNeedsAuth(true);
      setAuthError('Your Google authorization expired. Please sign in again to continue.');
      return;
    }
    const msg = err instanceof Error ? err.message : fallbackMessage;
    setBanner({ tone: 'error', text: msg });
  }, []);

  const syncAllGoogleContacts = useCallback(
    async (explicitToken?: string) => {
      const token = explicitToken ?? (await getAccessToken());
      if (!token) {
        setNeedsAuth(true);
        return;
      }

      setIsSyncingContacts(true);
      try {
        const [saved, other, fetchedGroups] = await Promise.all([
          fetchSavedContacts(token),
          fetchOtherContacts(token).catch(() => [] as ContactRecord[]),
          fetchContactGroups(token).catch(() => [] as ContactGroup[]),
        ]);
        setSavedContacts(saved);
        setOtherContacts(other);
        setGroups(fetchedGroups);
        setLastSyncedAt(
          new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        );
      } catch (err) {
        handleApiError(err, 'Unable to load contacts from Google.');
      } finally {
        setIsSyncingContacts(false);
      }
    },
    [handleApiError]
  );

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setExistingEmail(authedUser.email);
        setNeedsAuth(false);
        setAuthError(null);
        void syncAllGoogleContacts(token);
      },
      (knownUser) => {
        setUser(knownUser);
        setExistingEmail(knownUser?.email ?? null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, [syncAllGoogleContacts]);

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setExistingEmail(result.user.email);
      setNeedsAuth(false);
      await syncAllGoogleContacts(result.accessToken);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.';
      setAuthError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setExistingEmail(null);
    setSavedContacts([]);
    setOtherContacts([]);
    setGroups([]);
    setDiscovered([]);
    setStagedContacts([]);
    setNeedsAuth(true);
  };

  const executeBatchImport = async (contactsToImport: StagedContact[], groupRn?: string) => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setIsImporting(true);
    setImportProgress({ completed: 0, total: contactsToImport.length });
    try {
      const { created, results } = await batchCreateContacts(
        token,
        contactsToImport,
        groupRn,
        (completed, total) => setImportProgress({ completed, total })
      );

      const resultById = new Map(results.map((r) => [r.stagedId, r]));
      setStagedContacts((prev) =>
        prev.map((row) => {
          const outcome = resultById.get(row.id);
          if (!outcome) return row;
          return outcome.ok
            ? { ...row, status: 'imported', selected: false }
            : { ...row, status: 'failed', errorMessage: outcome.error };
        })
      );

      if (created.length > 0) {
        const createdEmailSet = new Set(
          created.map((c) => c.email.toLowerCase()).filter(Boolean)
        );
        setDiscovered((prev) =>
          prev.map((d) =>
            createdEmailSet.has(d.email.toLowerCase())
              ? { ...d, savedStatus: 'saved', selected: false }
              : d
          )
        );
        await syncAllGoogleContacts(token);
      }

      const successCount = results.filter((r) => r.ok).length;
      const failCount = results.length - successCount;
      setBanner({
        tone: failCount > 0 && successCount === 0 ? 'error' : 'success',
        text:
          failCount > 0
            ? `Imported ${successCount} contact(s) to Google Contacts; ${failCount} failed.`
            : `Successfully imported ${successCount} contact(s) into Google Contacts.`,
      });
    } catch (err) {
      handleApiError(err, 'Batch contact import failed.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleRequestBatchImport = (contactsToImport: StagedContact[], groupRn?: string) => {
    const labelName = groupRn
      ? groups.find((g) => g.resourceName === groupRn)?.formattedName ?? 'selected label'
      : 'My Contacts';

    setConfirmModal({
      title: `Import ${contactsToImport.length} contact${contactsToImport.length === 1 ? '' : 's'} to Google Contacts?`,
      description: `This will create ${contactsToImport.length} new contact record${
        contactsToImport.length === 1 ? '' : 's'
      } in your Google account (${user?.email ?? 'connected account'}) under "${labelName}".`,
      details: contactsToImport
        .slice(0, 12)
        .map((c) => `${c.fullName || 'Unnamed'} <${c.email || c.phone}>`),
      confirmLabel: `Import ${contactsToImport.length} Contact${contactsToImport.length === 1 ? '' : 's'}`,
      tone: 'primary',
      onConfirm: () => executeBatchImport(contactsToImport, groupRn),
    });
  };

  const handleRequestCreateGroup = (name: string) => {
    setConfirmModal({
      title: `Create Google Contacts label "${name}"?`,
      description: `This creates a new contact group label named "${name}" in your Google Contacts account.`,
      confirmLabel: 'Create Label',
      tone: 'primary',
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          return;
        }
        try {
          const created = await createContactGroup(token, name);
          setGroups((prev) => [...prev, created]);
          setSelectedGroupRn(created.resourceName);
          setBanner({ tone: 'success', text: `Created label "${created.formattedName}".` });
        } catch (err) {
          handleApiError(err, 'Failed to create contact label.');
        }
      },
    });
  };

  const handleScanGmail = async () => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setIsScanningGmail(true);
    setScanError(null);
    setScanProgress({ scanned: 0, total: 60 });

    try {
      const savedEmails = new Set<string>();
      for (const c of savedContacts) {
        if (c.email) savedEmails.add(c.email.toLowerCase());
        for (const extra of c.additionalEmails) savedEmails.add(extra.toLowerCase());
      }
      const otherEmails = new Set<string>();
      for (const c of otherContacts) {
        if (c.email) otherEmails.add(c.email.toLowerCase());
      }

      const items = await scanGmailCorrespondents(
        token,
        user?.email,
        savedEmails,
        otherEmails,
        (scanned, total) => setScanProgress({ scanned, total })
      );
      setDiscovered(items);
    } catch (err) {
      if (err instanceof GoogleApiError && err.status === 401) {
        handleApiError(err, 'Authorization expired.');
      } else {
        setScanError(
          err instanceof Error
            ? err.message
            : 'Unable to scan Gmail message headers. Check your Gmail permissions.'
        );
      }
    } finally {
      setIsScanningGmail(false);
      setScanProgress(null);
    }
  };

  const handleSendDiscoveredToStaging = (items: GmailDiscoveredContact[]) => {
    const drafts = items.map((d) => {
      const parts = d.name.trim().split(/\s+/);
      return {
        firstName: parts[0] ?? '',
        lastName: parts.slice(1).join(' '),
        fullName: d.name,
        email: d.email,
        phone: '',
        organization: '',
        jobTitle: '',
        notes: `Discovered from Gmail (${d.messageCount} messages, latest: ${d.lastSubject})`,
        originLabel: 'Gmail Headers',
      };
    });
    setStagedContacts(evaluateStagedContacts(drafts, savedContacts));
    setActiveTab('import');
  };

  const handleRequestDirectImportFromGmail = (items: GmailDiscoveredContact[]) => {
    const staged = evaluateStagedContacts(
      items.map((d) => {
        const parts = d.name.trim().split(/\s+/);
        return {
          firstName: parts[0] ?? '',
          lastName: parts.slice(1).join(' '),
          fullName: d.name,
          email: d.email,
          phone: '',
          organization: '',
          jobTitle: '',
          notes: `Imported from Gmail headers (${d.messageCount} messages)`,
          originLabel: 'Gmail Headers',
        };
      }),
      savedContacts
    );

    setConfirmModal({
      title: `Import ${staged.length} Gmail correspondent${staged.length === 1 ? '' : 's'}?`,
      description: `This will add ${staged.length} contact${
        staged.length === 1 ? '' : 's'
      } discovered from Gmail headers into your Google Contacts.`,
      details: staged.slice(0, 12).map((c) => `${c.fullName} <${c.email}>`),
      confirmLabel: `Import ${staged.length} Contact${staged.length === 1 ? '' : 's'}`,
      tone: 'primary',
      onConfirm: () => executeBatchImport(staged),
    });
  };

  const handleRequestUpdateContact = (
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
  ) => {
    setConfirmModal({
      title: `Update "${contact.fullName}" in Google Contacts?`,
      description:
        'This will overwrite the existing contact details in your Google Contacts account.',
      details: [
        `Name: ${[patch.firstName, patch.lastName].filter(Boolean).join(' ') || contact.fullName}`,
        patch.email ? `Email: ${patch.email}` : 'Email: (none)',
        patch.phone ? `Phone: ${patch.phone}` : 'Phone: (none)',
      ],
      confirmLabel: 'Save Contact Changes',
      tone: 'primary',
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          return;
        }
        try {
          const updated = await updateGoogleContact(token, contact, patch);
          setSavedContacts((prev) =>
            prev.map((c) => (c.resourceName === updated.resourceName ? updated : c))
          );
          setInspectedContact(updated);
          setBanner({ tone: 'success', text: `Updated "${updated.fullName}".` });
        } catch (err) {
          handleApiError(err, 'Failed to update contact.');
        }
      },
    });
  };

  const handleRequestDeleteContact = (contact: ContactRecord) => {
    setConfirmModal({
      title: `Delete "${contact.fullName}" from Google Contacts?`,
      description:
        'This permanently deletes the contact from your Google account. This action cannot be undone.',
      details: [
        contact.fullName,
        contact.email || contact.phone || contact.resourceName,
      ],
      confirmLabel: 'Delete Permanently',
      tone: 'danger',
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          return;
        }
        try {
          await deleteGoogleContact(token, contact.resourceName);
          setSavedContacts((prev) =>
            prev.filter((c) => c.resourceName !== contact.resourceName)
          );
          setInspectedContact(null);
          setBanner({ tone: 'success', text: `Deleted "${contact.fullName}".` });
        } catch (err) {
          handleApiError(err, 'Failed to delete contact.');
        }
      },
    });
  };

  const handleRequestPromoteOther = (contactsToPromote: ContactRecord[]) => {
    setConfirmModal({
      title: `Save ${contactsToPromote.length} Other Contact${contactsToPromote.length === 1 ? '' : 's'} to My Contacts?`,
      description:
        'This promotes the selected auto-saved Gmail contacts into your primary Google Contacts address book.',
      details: contactsToPromote
        .slice(0, 12)
        .map((c) => `${c.fullName} <${c.email || c.phone}>`),
      confirmLabel: `Save ${contactsToPromote.length} Contact${contactsToPromote.length === 1 ? '' : 's'}`,
      tone: 'primary',
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          return;
        }
        try {
          let promotedCount = 0;
          for (const c of contactsToPromote) {
            await promoteOtherContact(token, c.resourceName);
            promotedCount += 1;
          }
          setInspectedContact(null);
          await syncAllGoogleContacts(token);
          setBanner({
            tone: 'success',
            text: `Saved ${promotedCount} contact${promotedCount === 1 ? '' : 's'} to My Contacts.`,
          });
        } catch (err) {
          handleApiError(err, 'Failed to promote selected Other Contacts.');
        }
      },
    });
  };

  const unsavedGmailCount = useMemo(
    () => discovered.filter((d) => d.savedStatus === 'unsaved').length,
    [discovered]
  );

  if (needsAuth) {
    return (
      <SignInScreen
        onSignIn={handleSignIn}
        isLoading={isLoggingIn}
        existingEmail={existingEmail}
        errorMessage={authError}
      />
    );
  }

  const navItems: Array<{
    key: WorkspaceTab;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }> = [
    {
      key: 'import',
      label: 'Import Contacts',
      icon: <Upload className="h-4 w-4" />,
      count: stagedContacts.length > 0 ? stagedContacts.length : undefined,
    },
    {
      key: 'discover',
      label: 'Discover from Gmail',
      icon: <MailSearch className="h-4 w-4" />,
      count: unsavedGmailCount > 0 ? unsavedGmailCount : undefined,
    },
    {
      key: 'saved',
      label: 'Saved Contacts',
      icon: <BookUser className="h-4 w-4" />,
      count: savedContacts.length,
    },
    {
      key: 'other',
      label: 'Other Contacts',
      icon: <Users className="h-4 w-4" />,
      count: otherContacts.length,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center border-b border-slate-200 px-6">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Relay Contacts
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Primary workspace navigation">
          {navItems.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 whitespace-nowrap">
                  <span className={active ? 'text-blue-700' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  {item.label}
                </span>
                {item.count !== undefined && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-blue-700 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? 'Account avatar'}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full border border-slate-200 object-cover shrink-0"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                {(user?.email?.[0] ?? 'G').toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-900">
                {user?.displayName || 'Google Account'}
              </p>
              <p className="truncate font-mono text-[11px] text-slate-500">
                {user?.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 flex lg:hidden bg-slate-900/40"
          onClick={() => setMobileNavOpen(false)}
        >
          <aside
            className="flex w-64 flex-col bg-white border-r border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
              <span className="font-display text-base font-bold text-slate-900">
                Relay Contacts
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileNavOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                    activeTab === item.key
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    {item.label}
                  </span>
                  {item.count !== undefined && (
                    <span className="font-mono text-xs tabular-nums">{item.count}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="border-t border-slate-200 p-4">
              <p className="truncate font-mono text-xs text-slate-600">{user?.email}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400">Workspace</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="truncate font-display font-semibold text-slate-900">
                {TAB_LABELS[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {lastSyncedAt && (
              <span className="hidden md:inline text-xs text-slate-500 tabular-nums whitespace-nowrap">
                Synced {lastSyncedAt}
              </span>
            )}
            <button
              type="button"
              onClick={() => void syncAllGoogleContacts()}
              disabled={isSyncingContacts}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isSyncingContacts ? 'animate-spin' : ''}`}
              />
              {isSyncingContacts ? 'Syncing...' : 'Refresh Contacts'}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 space-y-6">
          {/* Unboxed Tabular Overview Strip */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Saved Contacts</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
                {savedContacts.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Other Contacts</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
                {otherContacts.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Contact Labels</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
                {groups.filter((g) => g.resourceName !== 'contactGroups/myContacts').length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Staged for Import</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-blue-700">
                {stagedContacts.filter((c) => c.selected && c.status !== 'imported').length}
              </p>
            </div>
          </div>

          {banner && (
            <div
              role="status"
              className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-3 text-xs font-medium ${
                banner.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{banner.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="rounded p-1 hover:bg-black/5"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'import' && (
            <ImportStudioView
              existingContacts={savedContacts}
              groups={groups}
              stagedContacts={stagedContacts}
              onChangeStaged={setStagedContacts}
              selectedGroupRn={selectedGroupRn}
              onSelectGroupRn={setSelectedGroupRn}
              onRequestCreateGroup={handleRequestCreateGroup}
              onRequestBatchImport={handleRequestBatchImport}
              isImporting={isImporting}
              importProgress={importProgress}
            />
          )}

          {activeTab === 'discover' && (
            <GmailDiscoverView
              discovered={discovered}
              onChangeDiscovered={setDiscovered}
              isScanning={isScanningGmail}
              scanProgress={scanProgress}
              scanError={scanError}
              onScanGmail={handleScanGmail}
              onSendToStaging={handleSendDiscoveredToStaging}
              onRequestDirectImport={handleRequestDirectImportFromGmail}
            />
          )}

          {activeTab === 'saved' && (
            <ContactsDirectoryView
              mode="saved"
              contacts={savedContacts}
              groups={groups}
              isLoading={isSyncingContacts}
              onInspectContact={setInspectedContact}
              onGoToImport={() => setActiveTab('import')}
            />
          )}

          {activeTab === 'other' && (
            <ContactsDirectoryView
              mode="other"
              contacts={otherContacts}
              groups={groups}
              isLoading={isSyncingContacts}
              onInspectContact={setInspectedContact}
              onRequestPromoteOther={handleRequestPromoteOther}
            />
          )}
        </main>
      </div>

      <ContactDetailDrawer
        contact={inspectedContact}
        groups={groups}
        onClose={() => setInspectedContact(null)}
        onRequestSave={handleRequestUpdateContact}
        onRequestDelete={handleRequestDeleteContact}
        onRequestPromote={(c) => handleRequestPromoteOther([c])}
      />

      <ConfirmActionModal
        config={confirmModal}
        onClose={() => setConfirmModal(null)}
      />
    </div>
  );
}
