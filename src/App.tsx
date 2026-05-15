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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans overflow-hidden relative">
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="w-full max-w-3xl relative z-10 flex flex-col h-full flex-1 justify-center">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-12 border-b border-white/5 pb-6">
          <div className="flex items-center gap-3 mb-4 sm:mb-0">
            <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white" aria-label="AI Vocal Remover">
                AI Vocal Remover
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="px-4 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-xs font-medium text-slate-300">
              {profile?.plan === 'free'
                ? t('header.plan_free', { used: profile.monthly_jobs_used })
                : t('header.plan_pro')}
            </div>
            <button
              onClick={() => {
                if (!session) {
                  window.dispatchEvent(new Event('open-auth-panel'));
                }
              }}
              className="px-4 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-xs font-medium text-slate-300 flex items-center gap-2 hover:bg-white/10"
            >
              <UserCircle className="w-4 h-4 text-indigo-300" />
              <span>{session?.user.email || t('header.unauth')}</span>
              <span className="text-indigo-300">{t(planLabelKey)}</span>
            </button>
            {session && (
              <button
                onClick={() => {
                  setShowHistory((current) => !current);
                  void loadJobs();
                }}
                className="h-9 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-semibold text-slate-300 hover:bg-white/10"
              >
                {t('header.history')}
              </button>
            )}
            <a
              href="/pricing"
              className="h-9 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/25"
            >
              {t('header.pricing')}
            </a>
            {session && isProPlan && (
              <button
                onClick={() => openCustomerPortal().catch((error) => setErrorMessage(error.message))}
                className="h-9 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-semibold text-slate-300 hover:bg-white/10"
              >
                {t('header.manage_subscription')}
              </button>
            )}
            <button
              onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
              className="h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-300 hover:bg-white/10 flex items-center gap-1.5"
              aria-label="Toggle language"
            >
              <Languages className="w-3.5 h-3.5" />
              {t('header.lang_switch')}
            </button>
            {session && (
              <button
                onClick={() => supabase?.auth.signOut()}
                className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 grid place-items-center"
                title={t('header.logout')}
                aria-label={t('header.logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
            <div className="px-4 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-xs font-medium uppercase tracking-wider text-slate-400">
              UVR5 / HTDemucs
            </div>
          </div>
        </header>

        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl p-8 flex flex-col w-full">
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
                    className="w-full h-64 bg-white/5 backdrop-blur-2xl border border-dashed border-white/20 rounded-3xl flex flex-col items-center justify-center gap-2 group cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-2">
                       <Upload className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="text-lg text-slate-300">
                      {file ? file.name : <><span className="text-indigo-400 font-semibold">{t('upload.drop_hint_call')}</span> {t('upload.drop_hint_tail')}</>}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{t('upload.drop_supports', { max: maxFileSizeLabel })}</p>
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
                      className="mt-4 w-full flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{inlineErrorMessage}</span>
                    </div>
                  )}

                  {!isAuthenticated && (
                    <p className="mt-3 text-xs text-slate-500">{t('upload.trial_note')}</p>
                  )}

                  <div className="mt-5 w-full rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                        placeholder={t('upload.url_placeholder')}
                        className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500"
                      />
                      <button
                        onClick={handleUrlImport}
                        disabled={!sourceUrl}
                        className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t('upload.url_import')}
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">{t('upload.url_note')}</p>
                  </div>

                  {file && (
                    <div className="w-full mt-6">
                      <button
                        onClick={handleStart}
                        className="w-full py-5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl font-bold shadow-2xl shadow-indigo-500/30 flex items-center justify-center gap-3 transition-colors mt-2"
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
                  <div className="flex-1 flex items-center gap-[2px] h-32 mb-12 justify-center opacity-80">
                    <div className="w-1 h-12 bg-white/10 rounded-full animate-pulse"></div><div className="w-1 h-20 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div><div className="w-1 h-32 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.4)] animate-pulse" style={{animationDelay: '0.2s'}}></div><div className="w-1 h-24 bg-indigo-500 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div><div className="w-1 h-16 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div><div className="w-1 h-28 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div><div className="w-1 h-14 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '0.6s'}}></div><div className="w-1 h-36 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '0.7s'}}></div><div className="w-1 h-20 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '0.8s'}}></div><div className="w-1 h-30 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '0.9s'}}></div><div className="w-1 h-18 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '1.0s'}}></div><div className="w-1 h-32 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '1.1s'}}></div><div className="w-1 h-22 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '1.2s'}}></div><div className="w-1 h-12 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '1.3s'}}></div><div className="w-1 h-32 bg-white/10 rounded-full animate-pulse" style={{animationDelay: '1.4s'}}></div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-end text-xs">
                      <div className="space-y-1">
                        <span className="text-slate-400 block">{t('progress.status_label')}</span>
                        <span className="text-indigo-400 font-semibold">
                          {status === 'uploading' ? t('progress.uploading') : t('progress.processing')}
                          {status === 'uploading' && uploadProgress !== null ? ` ${uploadProgress}%` : ''}
                        </span>
                        <span className="text-slate-500 block">
                          {status === 'processing' ? processingDetailFallback() : statusDetail}
                        </span>
                      </div>
                      <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /></span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden relative">
                      {status === 'uploading' && uploadProgress !== null ? (
                        <div
                          className="absolute top-0 left-0 h-full bg-indigo-400 transition-[width] duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      ) : (
                        <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-indigo-600/30 via-indigo-400/80 to-indigo-600/30 animate-[translateX_2s_linear_infinite]" style={{backgroundSize: '200% 100%'}}></div>
                      )}
                      <style>{`@keyframes translateX { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
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
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h3 className="text-lg font-medium">{file?.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{t('result.complete')} · {t('result.expires')}</p>
                    </div>
                    <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded-md uppercase">{t('result.finished')}</span>
                  </div>

                  <div className="mt-4 pt-8 border-t border-white/5 flex flex-col gap-4">
                    {getStemEntries(result).map(([stem, stemResult]) => (
                       <div key={stem} className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                         <div className="flex items-center gap-4 w-full">
                           <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex flex-shrink-0 items-center justify-center text-indigo-400">
                             <FileAudio className="w-6 h-6" />
                           </div>
                           <div className="flex-1 w-full max-w-[200px] sm:max-w-xs">
                             <p className="text-sm font-semibold text-slate-200">{stemDisplayName(stem)}</p>
                             <audio controls src={getStemUrl(stemResult)} className="h-8 mt-2 w-full" />
                           </div>
                         </div>
                         <a
                            href={getStemUrl(stemResult, true)}
                            download={`${stem}-${file?.name}`}
                            className="px-6 py-3 shrink-0 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                         >
                            <Download className="w-4 h-4" /> {t('result.download')}
                         </a>
                       </div>
                    ))}
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
                    className="mt-8 mx-auto px-6 py-2 text-xs font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors border border-white/5"
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
                  <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex flex-col items-center">
                    <div className="bg-rose-500/20 p-4 rounded-full mb-6 text-rose-400">
                      <AlertCircle className="w-12 h-12" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('error.title')}</h3>
                    <p className="text-rose-400 mb-8 max-w-md">{errorMessage}</p>

                    <button
                      onClick={() => {
                        setStatus('idle');
                        setErrorMessage('');
                      }}
                      className="px-6 py-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl transition-colors text-sm font-bold"
                    >
                      {t('error.try_again')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {session && showHistory && (
            <section className="mt-6 border-t border-white/10 pt-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">{t('history.title')}</h2>
                <button onClick={loadJobs} className="text-xs text-indigo-300 hover:text-indigo-200">{t('history.refresh')}</button>
              </div>
              <div className="space-y-3">
                {jobs.length === 0 && <p className="text-sm text-slate-500">{t('history.empty')}</p>}
                {jobs.map((job) => (
                  <div key={job.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-200">{job.source_filename || t('history.unnamed')}</p>
                        <p className="text-xs text-slate-500">{new Date(job.created_at).toLocaleString(locale)} · {historyStatusLabel(job.status)}</p>
                      </div>
                      <button
                        onClick={() => deleteJob(job.id)}
                        className="self-start rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/10 hover:text-white sm:self-auto"
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
                            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/20"
                          >
                            {t('history.download_stem', { stem: stemDisplayName(stem) })}
                          </a>
                        ))}
                      </div>
                    )}
                    {job.status === 'failed' && <p className="mt-2 text-xs text-rose-300">{job.error}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <footer className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-slate-500">
          <a href="/terms" className="hover:text-slate-300">{t('footer.terms')}</a>
          <a href="/privacy" className="hover:text-slate-300">{t('footer.privacy')}</a>
          <a href="/refund-policy" className="hover:text-slate-300">{t('footer.refund')}</a>
        </footer>
      </div>
  );
}
