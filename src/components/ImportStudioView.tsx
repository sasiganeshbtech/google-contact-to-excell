import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  CopyCheck,
  Download,
  FileSpreadsheet,
  FolderPlus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  ContactGroup,
  ContactRecord,
  ParsedCsvPreview,
  StagedContact,
  TargetContactField,
} from '../types/contacts';
import {
  buildCsvPreview,
  csvPreviewToStaged,
  downloadTextFile,
  evaluateStagedContacts,
  parseFreeformEmailText,
  parseVcardText,
  SAMPLE_IMPORT_CSV,
} from '../lib/parsers';

interface ImportStudioViewProps {
  existingContacts: ContactRecord[];
  groups: ContactGroup[];
  stagedContacts: StagedContact[];
  onChangeStaged: React.Dispatch<React.SetStateAction<StagedContact[]>>;
  selectedGroupRn: string;
  onSelectGroupRn: (rn: string) => void;
  onRequestCreateGroup: (name: string) => void;
  onRequestBatchImport: (contactsToImport: StagedContact[], groupRn?: string) => void;
  isImporting: boolean;
  importProgress: { completed: number; total: number } | null;
}

type InputMode = 'file' | 'paste';
type StageFilter = 'all' | 'new' | 'duplicate' | 'invalid';

const FIELD_OPTIONS: Array<{ value: TargetContactField; label: string }> = [
  { value: 'ignore', label: 'Ignore column' },
  { value: 'fullName', label: 'Full Name' },
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'organization', label: 'Company' },
  { value: 'jobTitle', label: 'Job Title' },
  { value: 'notes', label: 'Notes' },
];

export const ImportStudioView: React.FC<ImportStudioViewProps> = ({
  existingContacts,
  groups,
  stagedContacts,
  onChangeStaged,
  selectedGroupRn,
  onSelectGroupRn,
  onRequestCreateGroup,
  onRequestBatchImport,
  isImporting,
  importProgress,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [csvPreview, setCsvPreview] = useState<ParsedCsvPreview | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const handleFile = async (file: File) => {
    setParseError(null);
    const lowerName = file.name.toLowerCase();
    const text = await file.text();

    if (lowerName.endsWith('.vcf') || lowerName.endsWith('.vcard') || text.includes('BEGIN:VCARD')) {
      setCsvPreview(null);
      const parsed = parseVcardText(text, file.name, existingContacts);
      if (parsed.length === 0) {
        setParseError(`No valid contacts were found inside "${file.name}".`);
        return;
      }
      onChangeStaged(parsed);
      return;
    }

    if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.txt')) {
      const preview = buildCsvPreview(file.name, text);
      if (preview.headers.length === 0 || preview.rows.length === 0) {
        setParseError(`"${file.name}" does not contain any contact rows.`);
        return;
      }
      setCsvPreview(preview);
      onChangeStaged(csvPreviewToStaged(preview, existingContacts));
      return;
    }

    setParseError('Unsupported file format. Upload a .csv, .tsv, or .vcf (vCard) file.');
  };

  const handleMappingChange = (colIndex: number, target: TargetContactField) => {
    if (!csvPreview) return;
    const nextMapping = { ...csvPreview.mapping, [colIndex]: target };
    const nextPreview = { ...csvPreview, mapping: nextMapping };
    setCsvPreview(nextPreview);
    onChangeStaged(csvPreviewToStaged(nextPreview, existingContacts));
  };

  const handleParsePaste = () => {
    setParseError(null);
    setCsvPreview(null);
    const parsed = parseFreeformEmailText(pasteText, existingContacts);
    if (parsed.length === 0) {
      setParseError('No valid email addresses found in the pasted text.');
      return;
    }
    onChangeStaged(parsed);
  };

  const handleUpdateRow = (
    id: string,
    field: 'fullName' | 'email' | 'phone' | 'organization',
    value: string
  ) => {
    onChangeStaged((prev) => {
      const updatedDrafts = prev.map((row) => {
        if (row.id !== id) return row;
        const nextRow = { ...row, [field]: value };
        if (field === 'fullName') {
          const parts = value.trim().split(/\s+/);
          nextRow.firstName = parts[0] ?? '';
          nextRow.lastName = parts.slice(1).join(' ');
        }
        return nextRow;
      });
      return evaluateStagedContacts(updatedDrafts, existingContacts).map((evaluated) => {
        const original = updatedDrafts.find((u) => u.id === evaluated.id);
        if (!original) return evaluated;
        if (original.status === 'imported') {
          return { ...evaluated, status: 'imported', selected: false };
        }
        return {
          ...evaluated,
          selected:
            evaluated.status === 'new'
              ? original.selected || original.status === 'invalid'
              : evaluated.status === 'duplicate'
                ? !original.skipDuplicate && original.selected
                : false,
          skipDuplicate: original.skipDuplicate,
        };
      });
    });
  };

  const toggleRowSelection = (id: string) => {
    onChangeStaged((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (row.status === 'invalid' || row.status === 'imported') return row;
        const nextSelected = !row.selected;
        return {
          ...row,
          selected: nextSelected,
          skipDuplicate: row.status === 'duplicate' ? !nextSelected : row.skipDuplicate,
        };
      })
    );
  };

  const counts = useMemo(() => {
    let ready = 0;
    let duplicates = 0;
    let invalid = 0;
    let imported = 0;
    let selectedForImport = 0;

    for (const c of stagedContacts) {
      if (c.status === 'new') ready += 1;
      if (c.status === 'duplicate') duplicates += 1;
      if (c.status === 'invalid') invalid += 1;
      if (c.status === 'imported') imported += 1;
      if (c.selected && c.status !== 'invalid' && c.status !== 'imported') {
        selectedForImport += 1;
      }
    }
    return {
      total: stagedContacts.length,
      ready,
      duplicates,
      invalid,
      imported,
      selectedForImport,
    };
  }, [stagedContacts]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stagedContacts.filter((row) => {
      if (stageFilter !== 'all' && row.status !== stageFilter) return false;
      if (!q) return true;
      return (
        row.fullName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.phone.toLowerCase().includes(q) ||
        row.organization.toLowerCase().includes(q)
      );
    });
  }, [stagedContacts, stageFilter, searchQuery]);

  const selectedReadyList = useMemo(
    () =>
      stagedContacts.filter(
        (c) => c.selected && c.status !== 'invalid' && c.status !== 'imported'
      ),
    [stagedContacts]
  );

  const toggleSelectAllVisible = () => {
    const selectableVisible = filteredRows.filter(
      (r) => r.status !== 'invalid' && r.status !== 'imported'
    );
    const allSelected =
      selectableVisible.length > 0 && selectableVisible.every((r) => r.selected);
    const visibleIds = new Set(selectableVisible.map((r) => r.id));

    onChangeStaged((prev) =>
      prev.map((row) => {
        if (!visibleIds.has(row.id)) return row;
        return {
          ...row,
          selected: !allSelected,
          skipDuplicate: row.status === 'duplicate' ? allSelected : row.skipDuplicate,
        };
      })
    );
  };

  const userLabels = groups.filter((g) => g.resourceName !== 'contactGroups/myContacts');

  return (
    <div className="space-y-6">
      {/* Source Input Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              1. Load Contact Source
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload a CSV or vCard (.vcf) export, or paste email addresses directly.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                downloadTextFile('sample-contacts-import.csv', SAMPLE_IMPORT_CSV, 'text/csv;charset=utf-8;')
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Sample CSV
            </button>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setInputMode('file')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  inputMode === 'file'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setInputMode('paste')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  inputMode === 'paste'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste Emails
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">
          {inputMode === 'file' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) void handleFile(droppedFile);
              }}
              className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/60'
                  : 'border-slate-300 bg-slate-50/70 hover:border-slate-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.vcf,.vcard,.txt"
                className="hidden"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) void handleFile(chosen);
                  e.target.value = '';
                }}
              />
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-900">
                Drop a CSV or vCard (.vcf) file here, or{' '}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  browse your device
                </button>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Supports Google Contacts CSV, Outlook CSV, Apple Contacts vCard, and custom spreadsheets
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                rows={4}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'Jane Doe <jane@northstar.io>, Marcus Vance <marcus@vance.co>\npriya@meridian.org'}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-slate-500">
                  Separate entries by new lines, commas, or semicolons.
                </span>
                <button
                  type="button"
                  onClick={handleParsePaste}
                  disabled={!pasteText.trim()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  Parse &amp; Stage Contacts
                </button>
              </div>
            </div>
          )}

          {parseError && (
            <div
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>

        {/* Interactive CSV Column Mapper */}
        {csvPreview && csvPreview.headers.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-900">Column Mapping</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="font-mono">{csvPreview.fileName}</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="tabular-nums">{csvPreview.rows.length} rows detected</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {csvPreview.headers.map((header, idx) => {
                const sampleValue = csvPreview.rows[0]?.[idx] ?? '';
                return (
                  <div
                    key={`${header}_${idx}`}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-800" title={header}>
                        {header || `Column ${idx + 1}`}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                      {sampleValue || '—'}
                    </p>
                    <select
                      aria-label={`Map column ${header || idx + 1}`}
                      value={csvPreview.mapping[idx] ?? 'ignore'}
                      onChange={(e) =>
                        handleMappingChange(idx, e.target.value as TargetContactField)
                      }
                      className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Staging & Normalization Data Grid */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              2. Review, Deduplicate &amp; Import
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
              <span>{counts.total} staged</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-medium">{counts.ready} new</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-700 font-medium">{counts.duplicates} duplicates</span>
              <span aria-hidden="true">·</span>
              <span className={counts.invalid > 0 ? 'text-red-700 font-medium' : ''}>
                {counts.invalid} invalid
              </span>
              {counts.imported > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-blue-700 font-medium">{counts.imported} imported</span>
                </>
              )}
            </div>
          </div>

          {stagedContacts.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Group / Label Assignment */}
              <div className="flex items-center gap-2">
                <label htmlFor="target-group-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  Label:
                </label>
                <select
                  id="target-group-select"
                  value={selectedGroupRn}
                  onChange={(e) => onSelectGroupRn(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  <option value="contactGroups/myContacts">My Contacts (Default)</option>
                  {userLabels.map((g) => (
                    <option key={g.resourceName} value={g.resourceName}>
                      {g.formattedName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewGroupInput((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  title="Create Google Contact label"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  New Label
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCsvPreview(null);
                  onChangeStaged([]);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-700 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          )}
        </div>

        {showNewGroupInput && (
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-6 py-3">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New Google Contacts label name (e.g. Q4 Leads)"
              className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="button"
              disabled={!newGroupName.trim()}
              onClick={() => {
                onRequestCreateGroup(newGroupName.trim());
                setNewGroupName('');
                setShowNewGroupInput(false);
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Create Label
            </button>
          </div>
        )}

        {stagedContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <FileSpreadsheet className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-800">No contacts staged yet</p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Upload a CSV or vCard file above, paste email addresses, or send discovered contacts from the Gmail Discovery tab.
            </p>
          </div>
        ) : (
          <>
            {/* Filter & Search Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-6 py-3">
              <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                {(
                  [
                    { key: 'all', label: `All (${counts.total})` },
                    { key: 'new', label: `New (${counts.ready})` },
                    { key: 'duplicate', label: `Duplicates (${counts.duplicates})` },
                    { key: 'invalid', label: `Needs Fix (${counts.invalid})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStageFilter(tab.key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                      stageFilter === tab.key
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
                  placeholder="Filter staged contacts..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Editable Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all visible contacts"
                        checked={
                          filteredRows.some((r) => r.status !== 'invalid' && r.status !== 'imported') &&
                          filteredRows
                            .filter((r) => r.status !== 'invalid' && r.status !== 'imported')
                            .every((r) => r.selected)
                        }
                        onChange={toggleSelectAllVisible}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                    </th>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Email</th>
                    <th className="px-3 py-2.5">Phone</th>
                    <th className="px-3 py-2.5">Company</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.fullName || row.email}`}
                          checked={row.selected}
                          disabled={row.status === 'invalid' || row.status === 'imported'}
                          onChange={() => toggleRowSelection(row.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-1.5 min-w-[160px]">
                        <input
                          type="text"
                          value={row.fullName}
                          disabled={row.status === 'imported'}
                          onChange={(e) => handleUpdateRow(row.id, 'fullName', e.target.value)}
                          placeholder="Full name"
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs font-medium text-slate-900 hover:border-slate-200 focus:border-blue-600 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1.5 min-w-[200px]">
                        <input
                          type="text"
                          value={row.email}
                          disabled={row.status === 'imported'}
                          onChange={(e) => handleUpdateRow(row.id, 'email', e.target.value)}
                          placeholder="email@company.com"
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 font-mono text-xs text-slate-700 hover:border-slate-200 focus:border-blue-600 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1.5 min-w-[140px]">
                        <input
                          type="text"
                          value={row.phone}
                          disabled={row.status === 'imported'}
                          onChange={(e) => handleUpdateRow(row.id, 'phone', e.target.value)}
                          placeholder="+1 555 0100"
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 font-mono text-xs tabular-nums text-slate-700 hover:border-slate-200 focus:border-blue-600 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1.5 min-w-[140px]">
                        <input
                          type="text"
                          value={row.organization}
                          disabled={row.status === 'imported'}
                          onChange={(e) => handleUpdateRow(row.id, 'organization', e.target.value)}
                          placeholder="Company"
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-slate-700 hover:border-slate-200 focus:border-blue-600 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.status === 'new' && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            Ready
                          </span>
                        )}
                        {row.status === 'duplicate' && (
                          <span
                            className="inline-flex items-center gap-1.5 font-medium text-amber-700"
                            title={
                              row.matchedContactName
                                ? `Matches existing contact: ${row.matchedContactName}`
                                : row.duplicateReason
                            }
                          >
                            <CopyCheck className="h-3.5 w-3.5 shrink-0" />
                            {row.selected ? 'Duplicate (Force Import)' : 'Duplicate Skipped'}
                          </span>
                        )}
                        {row.status === 'invalid' && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {row.errorMessage ?? 'Invalid'}
                          </span>
                        )}
                        {row.status === 'imported' && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-blue-700">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            Imported
                          </span>
                        )}
                        {row.status === 'failed' && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {row.errorMessage ?? 'Failed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/70 px-6 py-4 rounded-b-xl">
              <div className="text-xs text-slate-600 tabular-nums">
                {importProgress ? (
                  <span className="font-medium text-blue-700">
                    Importing {importProgress.completed} of {importProgress.total} contacts to Google...
                  </span>
                ) : (
                  <span>
                    <strong className="font-semibold text-slate-900">
                      {counts.selectedForImport}
                    </strong>{' '}
                    contact{counts.selectedForImport === 1 ? '' : 's'} selected for import
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={isImporting || selectedReadyList.length === 0}
                onClick={() =>
                  onRequestBatchImport(
                    selectedReadyList,
                    selectedGroupRn === 'contactGroups/myContacts' ? undefined : selectedGroupRn
                  )
                }
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isImporting
                  ? 'Importing Contacts...'
                  : `Import ${selectedReadyList.length} Contact${selectedReadyList.length === 1 ? '' : 's'} to Google`}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
