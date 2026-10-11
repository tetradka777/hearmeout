'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/reportClientError';

// Uncaught errors and unhandled promise rejections in the browser, reported
// to /api/errors. Mounted once in the root layout; renders nothing.
// Errors from browser extensions and cross-origin scripts ("Script error.")
// carry nothing useful and are skipped.
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (!e.message || e.message === 'Script error.' || /extension:\/\//.test(e.filename || '')) return;
      reportClientError(e.message, e.error instanceof Error ? e.error.stack : `${e.filename}:${e.lineno}:${e.colno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportClientError(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : null);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
