import React, { useState } from 'react';
import { BookUser, Check, MailSearch, ShieldCheck, Upload } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SignInScreenProps {
  onSignIn: () => void;
  isLoading: boolean;
  existingEmail?: string | null;
  errorMessage?: string | null;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({
  onSignIn,
  isLoading,
  existingEmail,
  errorMessage,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-6">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Relay Contacts
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <span className="whitespace-nowrap shrink-0">CSV &amp; vCard Import</span>
            <span className="whitespace-nowrap shrink-0">Gmail Discovery</span>
            <span className="whitespace-nowrap shrink-0">Deduplication</span>
            <span className="whitespace-nowrap shrink-0">Contact Labels</span>
          </nav>
          <div className="shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              disabled={isLoading}
              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {isLoading ? 'Connecting...' : 'Connect Google'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-12">
        <div className="grid w-full grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-8 lg:col-span-7">
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Google Contacts</span>
                <span aria-hidden="true">·</span>
                <span>Gmail Metadata</span>
                <span aria-hidden="true">·</span>
                <span>Batch Normalization</span>
              </div>

              <h1
                className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                Import, clean, and sync contacts straight to your Google account.
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-slate-600">
                {existingEmail
                  ? `Your session for ${existingEmail} needs a fresh Google authorization token to read and import contacts.`
                  : 'Connect your Google Workspace or Gmail account to import CSV and vCard address books, discover unsaved correspondents from recent email headers, and prevent duplicate entries.'}
              </p>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {errorMessage}
                </div>
              )}

              <div className="pt-2">
                <GoogleSignInButton
                  onClick={onSignIn}
                  disabled={isLoading}
                  label={
                    isLoading
                      ? 'Connecting to Google...'
                      : existingEmail
                        ? 'Reconnect Google Account'
                        : 'Sign in with Google'
                  }
                />
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 border-t border-slate-200 pt-6 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Upload className="h-4 w-4 text-blue-700" />
                  <span>CSV &amp; vCard Mapping</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  Auto-maps Outlook, LinkedIn, and Google CSV headers before import.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MailSearch className="h-4 w-4 text-blue-700" />
                  <span>Gmail Correspondent Scan</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  Surfaces frequent From/To/Cc contacts missing from your address book.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  <span>Confirmed Writes</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  Every batch import or edit waits for your explicit review and confirmation.
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:col-span-5">
            {!imgFailed ? (
              <img
                src="/src/assets/images/contacts_sync_illustration_1795439471890.jpg"
                alt="Organized white index cards and blue pen beside a brushed metal tray"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full min-h-[280px] w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-8 text-center">
                <BookUser className="mb-3 h-10 w-10 text-blue-700" />
                <p className="font-display text-sm font-semibold text-slate-800">
                  Relay Contacts Workspace
                </p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/45 to-transparent p-6 text-white">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>In-memory session tokens · Zero server storage</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
