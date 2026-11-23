import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, MailSearch, RefreshCw, Search, UserPlus } from 'lucide-react';
import type { GmailDiscoveredContact } from '../types/contacts';

interface GmailDiscoverViewProps {
  discovered: GmailDiscoveredContact[];
  onChangeDiscovered: React.Dispatch<React.SetStateAction<GmailDiscoveredContact[]>>;
  isScanning: boolean;
  scanProgress: { scanned: number; total: number } | null;
  scanError: string | null;
  onScanGmail: () => void;
  onSendToStaging: (items: GmailDiscoveredContact[]) => void;
  onRequestDirectImport: (items: GmailDiscoveredContact[]) => void;
}

type DiscoverFilter = 'all' | 'unsaved' | 'other' | 'saved';

export const GmailDiscoverView: React.FC<GmailDiscoverViewProps> = ({
  discovered,
  onChangeDiscovered,
  isScanning,
  scanProgress,
  scanError,
  onScanGmail,
  onSendToStaging,
  onRequestDirectImport,
}) => {
  const [filter, setFilter] = useState<DiscoverFilter>('unsaved');
  const [searchQuery, setSearchQuery] = useState('');

  const counts = useMemo(() => {
    let unsaved = 0;
    let other = 0;
    let saved = 0;
    let selected = 0;
    for (const item of discovered) {
      if (item.savedStatus === 'unsaved') unsaved += 1;
      if (item.savedStatus === 'other') other += 1;
      if (item.savedStatus === 'saved') saved += 1;
      if (item.selected) selected += 1;
    }
    return { total: discovered.length, unsaved, other, saved, selected };
  }, [discovered]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return discovered.filter((item) => {
      if (filter !== 'all' && item.savedStatus !== filter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.lastSubject.toLowerCase().includes(q)
      );
    });
  }, [discovered, filter, searchQuery]);

  const selectedItems = useMemo(
    () => discovered.filter((d) => d.selected),
    [discovered]
  );

  const toggleRow = (id: string) => {
    onChangeDiscovered((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAllVisible = () => {
    const visibleIds = new Set(filtered.map((f) => f.id));
    const allSelected = filtered.length > 0 && filtered.every((f) => f.selected);
    onChangeDiscovered((prev) =>
      prev.map((item) =>
        visibleIds.has(item.id) ? { ...item, selected: !allSelected } : item
      )
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Discover Correspondents from Gmail Headers
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-500">
              Scans From, To, and Cc headers across your 60 most recent Gmail messages without reading message bodies, and flags people not yet saved in Google Contacts.
            </p>
          </div>

          <button
            type="button"
            onClick={onScanGmail}
            disabled={isScanning}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {isScanning ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MailSearch className="h-3.5 w-3.5" />
            )}
            {isScanning
              ? scanProgress
                ? `Scanning ${scanProgress.scanned}/${scanProgress.total}...`
                : 'Scanning Gmail...'
              : discovered.length > 0
                ? 'Rescan Recent Gmail'
                : 'Scan Recent Gmail'}
          </button>
        </div>

        {scanError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800"
          >
            {scanError}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        {discovered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <MailSearch className="mb-3 h-9 w-9 text-slate-300" />
            <p className="text-sm font-medium text-slate-800">
              {isScanning ? 'Reading Gmail message headers...' : 'Ready to scan your Gmail headers'}
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Click Scan Recent Gmail above to surface email correspondents and import missing contacts straight into your Google address book.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-3.5">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    { key: 'unsaved', label: `Not in Contacts (${counts.unsaved})` },
                    { key: 'other', label: `Other Contacts (${counts.other})` },
                    { key: 'saved', label: `Saved (${counts.saved})` },
                    { key: 'all', label: `All (${counts.total})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilter(tab.key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                      filter === tab.key
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search discovered people..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all visible discovered contacts"
                        checked={filtered.length > 0 && filtered.every((f) => f.selected)}
                        onChange={toggleAllVisible}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                    </th>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Email</th>
                    <th className="px-3 py-2.5 text-right">Messages</th>
                    <th className="px-3 py-2.5">Latest Thread</th>
                    <th className="px-3 py-2.5">Last Seen</th>
                    <th className="px-4 py-2.5">Contact Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => toggleRow(item.id)}
                      className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.name}`}
                          checked={item.selected}
                          onChange={() => toggleRow(item.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                        {item.name}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                        {item.email}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                        {item.messageCount}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2.5 text-slate-500">
                        {item.lastSubject}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-500 whitespace-nowrap">
                        {item.lastSeenDisplay}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {item.savedStatus === 'saved' ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Saved
                          </span>
                        ) : item.savedStatus === 'other' ? (
                          <span className="text-slate-600 font-medium">Other Contacts</span>
                        ) : (
                          <span className="text-blue-700 font-medium">Not Saved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/70 px-6 py-4 rounded-b-xl">
              <span className="text-xs text-slate-600 tabular-nums">
                <strong className="font-semibold text-slate-900">{selectedItems.length}</strong>{' '}
                correspondent{selectedItems.length === 1 ? '' : 's'} selected
              </span>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={() => onSendToStaging(selectedItems)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  Edit in Importer
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={() => onRequestDirectImport(selectedItems)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Import {selectedItems.length} to Google Contacts
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
