import React, { useState, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { upload } from '@vercel/blob/client';
import { Upload, FileAudio, Play, Loader2, Download, AlertCircle, LogOut, UserCircle, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, type Profile } from './lib/supabaseClient';
import { trackEvent } from './lib/events';
import { useLanguage } from './lib/i18n';

const FREE_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const PRO_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const DIRECT_UPLOAD_TIMEOUT_MS = 30_000;
const SERVER_UPLOAD_LIMIT_BYTES = 4_500_000;
const SERVER_UPLOAD_LIMIT_LABEL = '4.5MB';
const JOB_POLL_INTERVAL_MS = 5_000;
const JOB_TIMEOUT_MS = 15 * 60_000;
const TRIAL_STORAGE_KEY = 'ai-vocal-remover-trial-used';

type StemResult = string | {
  url: string;
  pathname?: string;
  contentType?: string;
  expiresInSeconds?: number;
};

type StemResults = Record<string, StemResult>;
type JobSummary = {
  id: string;
  source_filename: string | null;
  status: 'queued' | 'processing' | 'done' | 'failed';
  stems: StemResults | null;
  created_at: string;
  error: string | null;
};

type AppProps = {
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
};

type ProcessingPhase = 'queued' | 'separating' | 'encoding' | 'almost';

function createSafeBlobPathname(file: File) {
  const dotIndex = file.name.lastIndexOf('.');
  const rawBase = dotIndex === -1 ? file.name : file.name.slice(0, dotIndex);
  const rawExtension = dotIndex === -1 ? 'mp3' : file.name.slice(dotIndex + 1);
  const base = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'audio';
  const extension = rawExtension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp3';
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString();

  return `sources/${id}-${base}.${extension}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getProcessingPhase(elapsedMs: number): ProcessingPhase {
  const seconds = elapsedMs / 1000;
  if (seconds < 8) return 'queued';
  if (seconds < 60) return 'separating';
  if (seconds < 120) return 'encoding';
  return 'almost';
}

function getStemUrl(stemResult: StemResult, download = false) {
  if (typeof stemResult === 'string') {
    return stemResult;
  }

  return download ? `${stemResult.url}?download=1` : stemResult.url;
}

function getStemEntries(stems: StemResults) {
  return Object.entries(stems) as Array<[string, StemResult]>;
}

export default function App({ session, profile, refreshProfile }: AppProps) {
  const { t, locale, setLocale } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [inlineErrorMessage, setInlineErrorMessage] = useState('');
  const [result, setResult] = useState<StemResults | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [statusDetail, setStatusDetail] = useState('');
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAuthenticated = Boolean(session);
  const isProPlan = profile?.plan === 'pro_monthly' || profile?.plan === 'pro_yearly';
  const planLabelKey = profile
    ? profile.plan === 'pro_monthly'
      ? 'header.plan_pro_monthly'
      : profile.plan === 'pro_yearly'
        ? 'header.plan_pro_yearly'
        : 'header.plan_free_label'
    : 'header.plan_trial';
  const maxFileSizeBytes = isProPlan ? PRO_MAX_FILE_SIZE_BYTES : FREE_MAX_FILE_SIZE_BYTES;
  const maxFileSizeLabel = isProPlan ? '100MB' : '15MB';
  const processingPhase = getProcessingPhase(processingElapsed);
  const elapsedLabel = formatElapsed(processingElapsed);

  const getAuthHeaders = () => {
    if (!session?.access_token) {
      return {};
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  const loadJobs = async () => {
    if (!session) return;

    const response = await fetch('/api/jobs', {
      headers: getAuthHeaders(),
    });
    const data = await response.json();
    if (response.ok) {
      setJobs(data.jobs || []);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!session) return;

    const response = await fetch(`/api/jobs/${jobId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (response.ok) {
      setJobs((current) => current.filter((job) => job.id !== jobId));
    }
  };

  const openCustomerPortal = async () => {
    const response = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || t('error.billing_portal'));
    }

    window.location.href = data.url;
  };

  const selectFile = (selected: File) => {
    if (!selected.type.includes('audio') && !selected.name.endsWith('.mp3') && !selected.name.endsWith('.wav')) {
      setInlineErrorMessage(t('error.invalid_file'));
      return;
    }

    if (selected.size > maxFileSizeBytes) {
      setInlineErrorMessage(t('error.file_too_big', { max: maxFileSizeLabel }));
      return;
    }

    setFile(selected);
    setStatus('idle');
    setErrorMessage('');
    setInlineErrorMessage('');
    setResult(null);
    setUploadProgress(null);
    setStatusDetail('');
    setProcessingElapsed(0);
  };

  const uploadViaClient = async (selectedFile: File) => {
    const uploadController = new AbortController();
    const uploadTimeout = window.setTimeout(() => {
      uploadController.abort();
    }, DIRECT_UPLOAD_TIMEOUT_MS);

    try {
      setStatusDetail(t('progress.detail_connect_blob'));

      return await upload(createSafeBlobPathname(selectedFile), selectedFile, {
        access: 'public',
        handleUploadUrl: '/api/blob-upload',
        contentType: selectedFile.type || 'audio/mpeg',
        clientPayload: JSON.stringify({ filename: selectedFile.name, size: selectedFile.size }),
        multipart: false,
        abortSignal: uploadController.signal,
        onUploadProgress: ({ percentage }) => {
          setStatusDetail(t('progress.detail_direct_blob'));
          setUploadProgress(Math.max(0, Math.min(100, Math.round(percentage))));
        },
      });
    } finally {
      window.clearTimeout(uploadTimeout);
    }
  };

  const uploadViaServerFallback = async (selectedFile: File) => {
    if (selectedFile.size > SERVER_UPLOAD_LIMIT_BYTES) {
      throw new Error(t('error.fallback_too_big', { max: SERVER_UPLOAD_LIMIT_LABEL }));
    }

    setStatusDetail(t('progress.detail_fallback', { max: SERVER_UPLOAD_LIMIT_LABEL }));
    setUploadProgress(0);

    const data = await new Promise<{ url: string; pathname: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload-source');
      xhr.setRequestHeader('Content-Type', selectedFile.type || 'audio/mpeg');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(selectedFile.name));
      if (session?.access_token) {
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      }
      xhr.timeout = 60_000;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const percentage = Math.round((event.loaded / event.total) * 96);
        setUploadProgress(Math.max(1, Math.min(96, percentage)));
      };

      xhr.onload = () => {
        let parsed: { url: string; pathname: string; error?: string } | null = null;

        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error(t('error.fallback_invalid_resp')));
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(parsed?.error || t('error.fallback_failed')));
          return;
        }

        setStatusDetail(t('progress.detail_saved_blob'));
        setUploadProgress(100);
        resolve(parsed);
      };

      xhr.onerror = () => {
        reject(new Error(t('error.fallback_network')));
      };

      xhr.ontimeout = () => {
        reject(new Error(t('error.fallback_timeout')));
      };

      xhr.send(selectedFile);
    });

    return data;
  };

  const waitForSeparateJob = async (jobId: string) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
      await sleep(JOB_POLL_INTERVAL_MS);
      const elapsed = Date.now() - startedAt;
      setProcessingElapsed(elapsed);

      const response = await fetch('/api/separate-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ jobId }),
      });
      const data = await response.json();

      if (!response.ok || data.status === 'error') {
        throw new Error(data.error || t('error.modal_failed'));
      }

      if (data.status === 'done') {
        return data as { stems: StemResults };
      }
    }

    throw new Error(t('error.modal_timeout'));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      selectFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0]);
    }
  };

  const processSourceBlob = async (
    sourceBlob: { url: string; pathname: string },
    filename: string,
    sourceType: 'upload' | 'url',
  ) => {
    setUploadProgress(100);
    setStatus('processing');
    setProcessingElapsed(0);
    setStatusDetail(t('progress.detail_start_modal'));
    const response = await fetch('/api/separate-blob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        sourceUrl: sourceBlob.url,
        sourcePathname: sourceBlob.pathname,
        filename,
        sourceType,
      }),
    });

    const startData = await response.json();
    if (!response.ok) {
      throw new Error(startData.error || t('error.modal_failed'));
    }

    const jobResult = await waitForSeparateJob(startData.jobId);
    setResult(jobResult.stems);
    trackEvent(session, 'separation_completed', { sourceType });
    if (!isAuthenticated) {
      localStorage.setItem(TRIAL_STORAGE_KEY, 'true');
    }
    await refreshProfile();
    await loadJobs();
    setUploadProgress(null);
    setStatusDetail('');
    setProcessingElapsed(0);
    setStatus('done');
  };

  const handleUrlImport = async () => {
    if (!sourceUrl) return;

    if (!isAuthenticated && localStorage.getItem(TRIAL_STORAGE_KEY) === 'true') {
      setStatus('error');
      setErrorMessage(t('error.trial_used'));
      return;
    }

    setFile(null);
    setStatus('uploading');
    trackEvent(session, 'url_import_started');
    setUploadProgress(20);
    setErrorMessage('');
    setInlineErrorMessage('');
    setStatusDetail(t('progress.detail_url_fetch'));

    try {
      const response = await fetch('/api/url-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ url: sourceUrl }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('error.url_import_failed'));
      }

      setUploadProgress(100);
      await processSourceBlob(
        { url: data.sourceUrl, pathname: data.sourcePathname },
        data.filename || 'url-import.mp3',
        'url',
      );
    } catch (error) {
      console.error(error);
      setStatus('error');
      setUploadProgress(null);
      setStatusDetail('');
      setErrorMessage(error instanceof Error ? error.message : t('error.unknown'));
    }
  };

  const handleStart = async () => {
    if (!file) return;

    if (!isAuthenticated && localStorage.getItem(TRIAL_STORAGE_KEY) === 'true') {
      setStatus('error');
      setErrorMessage(t('error.trial_used'));
      return;
    }

    setStatus('uploading');
    trackEvent(session, 'upload_started', { size: file.size });
    setErrorMessage('');
    setInlineErrorMessage('');
    setUploadProgress(import.meta.env.PROD ? 0 : null);
    setStatusDetail(import.meta.env.PROD ? t('progress.detail_prepare') : '');

    try {
      let response: Response;

      if (import.meta.env.PROD) {
        let sourceBlob: { url: string; pathname: string };
        if (file.size <= SERVER_UPLOAD_LIMIT_BYTES) {
          sourceBlob = await uploadViaServerFallback(file);
        } else {
          try {
            sourceBlob = await uploadViaClient(file);
          } catch (uploadError) {
            console.warn('Direct Blob upload failed, trying fallback:', uploadError);
            sourceBlob = await uploadViaServerFallback(file);
          }
        }

        await processSourceBlob(sourceBlob, file.name, 'upload');
        return;
      } else {
        const formData = new FormData();
        formData.append('audio', file);

        setStatus('processing');
        response = await fetch('/api/separate', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('error.process_failed'));
      }

      setResult(data.stems);
      trackEvent(session, 'separation_completed', { sourceType: 'upload' });
      if (!isAuthenticated) {
        localStorage.setItem(TRIAL_STORAGE_KEY, 'true');
      }
      await refreshProfile();
      await loadJobs();
      setUploadProgress(null);
      setStatusDetail('');
      setProcessingElapsed(0);
      setStatus('done');
    } catch (error) {
      console.error(error);
      setStatus('error');
      trackEvent(session, 'separation_failed', { message: error instanceof Error ? error.message : 'unknown' });
      setUploadProgress(null);
      setStatusDetail('');
      setProcessingElapsed(0);
      if (error instanceof DOMException && error.name === 'AbortError') {
        setErrorMessage(t('error.upload_timeout'));
      } else {
        setErrorMessage(error instanceof Error ? error.message : t('error.unknown'));
      }
    }
  };

  const stemDisplayName = (stem: string) => {
    if (stem === 'other') return t('result.accompaniment');
    return stem.charAt(0).toUpperCase() + stem.slice(1);
  };

  const historyStatusLabel = (jobStatus: JobSummary['status']) => t(`history.status.${jobStatus}`);

  const processingDetailFallback = () => {
    switch (processingPhase) {
      case 'queued':
        return t('progress.queued', { elapsed: elapsedLabel });
      case 'separating':
        return t('progress.separating', { elapsed: elapsedLabel });
      case 'encoding':
        return t('progress.encoding', { elapsed: elapsedLabel });
      case 'almost':
        return t('progress.almost', { elapsed: elapsedLabel });
    }
  };

  return (
    <div className="min-h-screen text-[#305066] flex flex-col items-center p-6 overflow-hidden relative">
      <svg className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 opacity-70" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#0ea8e3" stroke="#305066" strokeWidth="4" /></svg>
      <svg className="pointer-events-none absolute top-32 right-8 w-24 h-24 opacity-80 toon-bounce" viewBox="0 0 100 100"><polygon points="50,5 61,38 95,38 67,58 78,92 50,72 22,92 33,58 5,38 39,38" fill="#db6968" stroke="#305066" strokeWidth="4" strokeLinejoin="round"/></svg>
      <svg className="pointer-events-none absolute bottom-10 left-10 w-28 h-28 opacity-80" viewBox="0 0 100 100"><rect x="15" y="15" width="70" height="70" rx="18" fill="#f2e2c4" stroke="#305066" strokeWidth="4" transform="rotate(-12 50 50)"/></svg>

      <div className="w-full max-w-3xl relative z-10 flex flex-col">
        <header className="mb-8 toon-card bg-white px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <a href="/" className="flex items-center gap-3 group">
            <div className="w-14 h-14 rounded-2xl bg-[#db6968] border-[3px] border-[#305066] grid place-items-center shadow-[3px_3px_0_#305066] group-hover:rotate-[-6deg] transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-[#fff8ea]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-2xl text-[#305066] leading-none" aria-label="AI Vocal Remover">
                AI Vocal Remover
              </h1>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#0ea8e3] mt-1">UVR5 · HTDemucs</p>
            </div>
          </a>

          <nav className="flex flex-wrap items-center justify-center gap-2">
            <span className="toon-chip" style={{background: '#f2e2c4'}}>
              {profile?.plan === 'free'
                ? t('header.plan_free', { used: profile.monthly_jobs_used })
                : t('header.plan_pro')}
            </span>
            <button
              onClick={() => { if (!session) window.dispatchEvent(new Event('open-auth-panel')); }}
              className="toon-btn text-xs"
            >
              <UserCircle className="w-4 h-4" />
              <span className="max-w-[140px] truncate">{session?.user.email || t('header.unauth')}</span>
              <span className="text-[#db6968]">·</span>
              <span className="text-[#0ea8e3]">{t(planLabelKey)}</span>
            </button>
            {session && (
              <button
                onClick={() => { setShowHistory((c) => !c); void loadJobs(); }}
                className="toon-btn text-xs"
              >
                {t('header.history')}
              </button>
            )}
            <a href="/pricing" className="toon-btn toon-btn-pink text-xs">
              {t('header.pricing')}
            </a>
            {session && isProPlan && (
              <button
                onClick={() => openCustomerPortal().catch((error) => setErrorMessage(error.message))}
                className="toon-btn text-xs"
              >
                {t('header.manage_subscription')}
              </button>
            )}
            <button
              onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
              className="toon-btn toon-btn-sky text-xs"
              aria-label="Toggle language"
            >
              <Languages className="w-3.5 h-3.5" />
              {t('header.lang_switch')}
            </button>
            {session && (
              <button
                onClick={() => supabase?.auth.signOut()}
                className="toon-btn !p-2 !w-10 !h-10"
                title={t('header.logout')}
                aria-label={t('header.logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </nav>
        </header>

        <div className="toon-card p-6 sm:p-8 flex flex-col w-full">
            <AnimatePresence mode="wait">
              {status === 'idle' && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center"
                >
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="w-full h-64 bg-[#f2e2c4] border-[3px] border-dashed border-[#305066] rounded-3xl flex flex-col items-center justify-center gap-2 group cursor-pointer hover:bg-[#fff8ea] transition-colors shadow-[6px_6px_0_#305066]"
                  >
                    <div className="w-20 h-20 bg-[#0ea8e3] border-[3px] border-[#305066] rounded-full flex items-center justify-center mb-2 shadow-[3px_3px_0_#305066] group-hover:scale-110 group-hover:rotate-6 transition-transform">
                       <Upload className="w-9 h-9 text-[#fff8ea]" strokeWidth={2.5} />
                    </div>
                    <p className="text-lg text-[#305066] font-extrabold">
                      {file ? file.name : <><span className="text-[#db6968] font-display">{t('upload.drop_hint_call')}</span> {t('upload.drop_hint_tail')}</>}
                    </p>
                    <p className="text-xs text-[#305066]/70 mt-1 font-bold uppercase tracking-wide">{t('upload.drop_supports', { max: maxFileSizeLabel })}</p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="audio/mpeg, audio/wav, .mp3, .wav"
                    className="hidden"
                  />

                  {inlineErrorMessage && (
                    <div
                      role="alert"
                      className="mt-4 w-full flex items-start gap-3 rounded-2xl border-[3px] border-[#305066] bg-[#db6968] px-4 py-3 text-sm text-[#fff8ea] font-bold shadow-[3px_3px_0_#305066]"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{inlineErrorMessage}</span>
                    </div>
                  )}

                  {!isAuthenticated && (
                    <p className="mt-3 text-xs text-[#305066]/70 font-bold">{t('upload.trial_note')}</p>
                  )}

                  <div className="mt-5 w-full toon-card-cream p-4">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                        placeholder={t('upload.url_placeholder')}
                        className="toon-input min-h-12 flex-1 text-sm"
                      />
                      <button
                        onClick={handleUrlImport}
                        disabled={!sourceUrl}
                        className="toon-btn toon-btn-sky text-sm px-5"
                      >
                        {t('upload.url_import')}
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-[#305066]/80 font-bold">{t('upload.url_note')}</p>
                  </div>

                  {file && (
                    <div className="w-full mt-6">
                      <button
                        onClick={handleStart}
                        className="w-full py-5 toon-btn toon-btn-pink text-base rounded-2xl !shadow-[6px_6px_0_#305066] font-display tracking-wide"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        {t('upload.start')}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {(status === 'uploading' || status === 'processing') && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-16 flex flex-col"
                >
                  <div className="flex-1 flex items-end gap-1 h-32 mb-10 justify-center">
                    {[12,20,32,24,16,28,14,36,20,30,18,32,22,12,32].map((h, i) => (
                      <div
                        key={i}
                        className="w-2 rounded-full border-[2px] border-[#305066] toon-bounce"
                        style={{
                          height: `${h * 3}px`,
                          background: i % 3 === 0 ? '#db6968' : i % 3 === 1 ? '#0ea8e3' : '#f2e2c4',
                          animationDelay: `${i * 0.08}s`,
                        }}
                      />
                    ))}
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-end text-xs">
                      <div className="space-y-1">
                        <span className="block text-[11px] uppercase tracking-widest font-extrabold text-[#305066]/70">{t('progress.status_label')}</span>
                        <span className="font-display text-xl text-[#db6968] block">
                          {status === 'uploading' ? t('progress.uploading') : t('progress.processing')}
                          {status === 'uploading' && uploadProgress !== null ? ` ${uploadProgress}%` : ''}
                        </span>
                        <span className="text-[#305066]/80 block font-bold">
                          {status === 'processing' ? processingDetailFallback() : statusDetail}
                        </span>
                      </div>
                      <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 text-[#0ea8e3] animate-spin" strokeWidth={3} /></span>
                    </div>
                    <div className="h-5 w-full bg-[#fff8ea] border-[3px] border-[#305066] rounded-full overflow-hidden relative shadow-[3px_3px_0_#305066]">
                      {status === 'uploading' && uploadProgress !== null ? (
                        <div
                          className="absolute top-0 left-0 h-full bg-[#0ea8e3] transition-[width] duration-300 border-r-[3px] border-[#305066]"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      ) : (
                        <div
                          className="absolute top-0 left-0 h-full w-full"
                          style={{
                            background: 'linear-gradient(90deg, #db6968 0%, #0ea8e3 50%, #db6968 100%)',
                            backgroundSize: '200% 100%',
                            animation: 'toon-shimmer 2s linear infinite',
                          }}
                        ></div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {status === 'done' && result && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col"
                >
                  <div className="flex justify-between items-start mb-6 gap-4">
                    <div>
                      <h3 className="font-display text-2xl text-[#305066] leading-tight">{file?.name}</h3>
                      <p className="text-xs text-[#305066]/70 mt-2 font-bold uppercase tracking-wide">{t('result.complete')} · {t('result.expires')}</p>
                    </div>
                    <span className="toon-chip" style={{background: '#db6968', color: '#fff8ea'}}>{t('result.finished')}</span>
                  </div>

                  <div className="mt-2 pt-6 border-t-[3px] border-dashed border-[#305066]/40 flex flex-col gap-4">
                    {getStemEntries(result).map(([stem, stemResult], idx) => {
                      const palette = ['#db6968', '#0ea8e3', '#f2e2c4', '#fff8ea'];
                      const bg = palette[idx % palette.length];
                      const txt = idx % palette.length < 2 ? '#fff8ea' : '#305066';
                      return (
                       <div key={stem} className="flex-1 bg-[#fff8ea] border-[3px] border-[#305066] rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[4px_4px_0_#305066]">
                         <div className="flex items-center gap-4 w-full">
                           <div className="w-14 h-14 rounded-2xl border-[3px] border-[#305066] flex flex-shrink-0 items-center justify-center shadow-[2px_2px_0_#305066]" style={{background: bg, color: txt}}>
                             <FileAudio className="w-7 h-7" strokeWidth={2.5} />
                           </div>
                           <div className="flex-1 w-full max-w-[200px] sm:max-w-xs">
                             <p className="font-display text-base text-[#305066]">{stemDisplayName(stem)}</p>
                             <audio controls src={getStemUrl(stemResult)} className="h-8 mt-2 w-full" />
                           </div>
                         </div>
                         <a
                            href={getStemUrl(stemResult, true)}
                            download={`${stem}-${file?.name}`}
                            className="toon-btn toon-btn-ink text-xs px-5"
                         >
                            <Download className="w-4 h-4" /> {t('result.download')}
                         </a>
                       </div>
                    );})}
                  </div>

                  <button
                    onClick={() => {
                      setStatus('idle');
                      setFile(null);
                      setResult(null);
                      setUploadProgress(null);
                      setStatusDetail('');
                      setProcessingElapsed(0);
                    }}
                    className="mt-8 mx-auto toon-btn toon-btn-sky text-sm px-6"
                  >
                    {t('result.process_another')}
                  </button>
                </motion.div>
              )}

              {status === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-12 flex flex-col items-center justify-center text-center"
                >
                  <div className="bg-[#fff8ea] border-[3px] border-[#305066] p-6 rounded-2xl flex flex-col items-center shadow-[6px_6px_0_#db6968] max-w-md">
                    <div className="bg-[#db6968] border-[3px] border-[#305066] p-5 rounded-full mb-5 text-[#fff8ea] shadow-[3px_3px_0_#305066]">
                      <AlertCircle className="w-10 h-10" strokeWidth={2.5} />
                    </div>
                    <h3 className="font-display text-2xl text-[#305066] mb-2">{t('error.title')}</h3>
                    <p className="text-[#305066]/80 mb-6 font-bold">{errorMessage}</p>

                    <button
                      onClick={() => {
                        setStatus('idle');
                        setErrorMessage('');
                      }}
                      className="toon-btn toon-btn-pink text-sm px-6"
                    >
                      {t('error.try_again')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {session && showHistory && (
            <section className="mt-6 toon-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl text-[#305066]">{t('history.title')}</h2>
                <button onClick={loadJobs} className="toon-btn toon-btn-sky text-xs">{t('history.refresh')}</button>
              </div>
              <div className="space-y-3">
                {jobs.length === 0 && <p className="text-sm text-[#305066]/70 font-bold">{t('history.empty')}</p>}
                {jobs.map((job) => (
                  <div key={job.id} className="rounded-2xl border-[3px] border-[#305066] bg-[#fff8ea] p-4 shadow-[3px_3px_0_#305066]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-extrabold text-[#305066]">{job.source_filename || t('history.unnamed')}</p>
                        <p className="text-xs text-[#305066]/70 font-bold">{new Date(job.created_at).toLocaleString(locale)} · {historyStatusLabel(job.status)}</p>
                      </div>
                      <button
                        onClick={() => deleteJob(job.id)}
                        className="toon-btn text-xs self-start sm:self-auto"
                      >
                        {t('history.delete')}
                      </button>
                    </div>
                    {job.status === 'done' && job.stems && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {getStemEntries(job.stems).map(([stem, stemResult]) => (
                          <a
                            key={stem}
                            href={getStemUrl(stemResult, true)}
                            className="toon-btn toon-btn-pink text-xs"
                          >
                            {t('history.download_stem', { stem: stemDisplayName(stem) })}
                          </a>
                        ))}
                      </div>
                    )}
                    {job.status === 'failed' && <p className="mt-2 text-xs text-[#db6968] font-extrabold">{job.error}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <footer className="mt-8 flex flex-wrap justify-center gap-3 text-xs">
          <a href="/terms" className="toon-btn text-xs">{t('footer.terms')}</a>
          <a href="/privacy" className="toon-btn text-xs">{t('footer.privacy')}</a>
          <a href="/refund-policy" className="toon-btn text-xs">{t('footer.refund')}</a>
        </footer>
      </div>
  );
}
