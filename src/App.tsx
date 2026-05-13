import React, { useState, useRef } from 'react';
import { upload } from '@vercel/blob/client';
import { Upload, FileAudio, Play, Loader2, Download, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '10MB';
const DIRECT_UPLOAD_TIMEOUT_MS = 30_000;
const SERVER_UPLOAD_LIMIT_BYTES = 4_500_000;
const SERVER_UPLOAD_LIMIT_LABEL = '4.5MB';
const JOB_POLL_INTERVAL_MS = 5_000;
const JOB_TIMEOUT_MS = 15 * 60_000;

type StemResult = string | {
  url: string;
  pathname?: string;
  contentType?: string;
  expiresInSeconds?: number;
};

type StemResults = Record<string, StemResult>;

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

function getStemUrl(stemResult: StemResult, download = false) {
  if (typeof stemResult === 'string') {
    return stemResult;
  }

  return download ? `${stemResult.url}?download=1` : stemResult.url;
}

function getStemEntries(stems: StemResults) {
  return Object.entries(stems) as Array<[string, StemResult]>;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<StemResults | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [statusDetail, setStatusDetail] = useState('');
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectFile = (selected: File) => {
    if (!selected.type.includes('audio') && !selected.name.endsWith('.mp3') && !selected.name.endsWith('.wav')) {
      setErrorMessage('Please upload a valid MP3 or WAV file.');
      return;
    }

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(`Please upload an audio file smaller than ${MAX_FILE_SIZE_LABEL}.`);
      return;
    }

    setFile(selected);
    setStatus('idle');
    setErrorMessage('');
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
      setStatusDetail('Connecting to Vercel Blob...');

      return await upload(createSafeBlobPathname(selectedFile), selectedFile, {
        access: 'private',
        handleUploadUrl: '/api/blob-upload',
        contentType: selectedFile.type || 'audio/mpeg',
        clientPayload: JSON.stringify({ filename: selectedFile.name, size: selectedFile.size }),
        multipart: false,
        abortSignal: uploadController.signal,
        onUploadProgress: ({ percentage }) => {
          setStatusDetail('Uploading directly to Vercel Blob...');
          setUploadProgress(Math.max(0, Math.min(100, Math.round(percentage))));
        },
      });
    } finally {
      window.clearTimeout(uploadTimeout);
    }
  };

  const uploadViaServerFallback = async (selectedFile: File) => {
    if (selectedFile.size > SERVER_UPLOAD_LIMIT_BYTES) {
      throw new Error(`Direct Blob upload did not complete, and this file is too large for the server fallback. Please try a file under ${SERVER_UPLOAD_LIMIT_LABEL} or another browser.`);
    }

    setStatusDetail(`Uploading through Vercel Function fallback (${SERVER_UPLOAD_LIMIT_LABEL} max)...`);
    setUploadProgress(10);

    const response = await fetch('/api/upload-source', {
      method: 'POST',
      headers: {
        'Content-Type': selectedFile.type || 'audio/mpeg',
        'x-file-name': encodeURIComponent(selectedFile.name),
      },
      body: selectedFile,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Server fallback upload failed.');
    }

    return data as { url: string; pathname: string };
  };

  const waitForSeparateJob = async (jobId: string) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
      await sleep(JOB_POLL_INTERVAL_MS);
      const elapsed = Date.now() - startedAt;
      setProcessingElapsed(elapsed);
      setStatusDetail(`Modal is processing your audio (${formatElapsed(elapsed)} elapsed)...`);

      const response = await fetch('/api/separate-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = await response.json();

      if (!response.ok || data.status === 'error') {
        throw new Error(data.error || 'Modal processing failed.');
      }

      if (data.status === 'done') {
        return data as { stems: StemResults };
      }
    }

    throw new Error('Modal processing timed out after 15 minutes.');
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

  const handleStart = async () => {
    if (!file) return;

    setStatus('uploading');
    setErrorMessage('');
    setUploadProgress(import.meta.env.PROD ? 0 : null);
    setStatusDetail(import.meta.env.PROD ? 'Preparing upload...' : '');

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

        setUploadProgress(100);
        setStatus('processing');
        setProcessingElapsed(0);
        setStatusDetail('Starting Modal processing job...');
        response = await fetch('/api/separate-blob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceUrl: sourceBlob.url,
            sourcePathname: sourceBlob.pathname,
            filename: file.name,
          }),
        });

        const startData = await response.json();
        if (!response.ok) {
          throw new Error(startData.error || 'Failed to start Modal processing.');
        }

        const jobResult = await waitForSeparateJob(startData.jobId);
        setResult(jobResult.stems);
        setUploadProgress(null);
        setStatusDetail('');
        setProcessingElapsed(0);
        setStatus('done');
        return;
      } else {
        const formData = new FormData();
        formData.append('audio', file);

        setStatus('processing');
        response = await fetch('/api/separate', {
          method: 'POST',
          body: formData,
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process audio.');
      }

      setResult(data.stems);
      setUploadProgress(null);
      setStatusDetail('');
      setProcessingElapsed(0);
      setStatus('done');
    } catch (error) {
      console.error(error);
      setStatus('error');
      setUploadProgress(null);
      setStatusDetail('');
      setProcessingElapsed(0);
      if (error instanceof DOMException && error.name === 'AbortError') {
        setErrorMessage('Upload timed out before reaching Vercel Blob. Please retry, or try a smaller audio file.');
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred.');
      }
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
              <h1 className="text-2xl font-bold tracking-tight text-white">AI Vocal <span className="font-light opacity-50">Remover</span></h1>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="px-5 py-2.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-xs font-medium uppercase tracking-wider text-slate-400">
              Powered by UVR5 (HTDemucs)
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
                    className="h-64 bg-white/5 backdrop-blur-2xl border border-dashed border-white/20 rounded-3xl flex flex-col items-center justify-center gap-2 group cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-2">
                       <Upload className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="text-lg text-slate-300">
                      {file ? file.name : <><span className="text-indigo-400 font-semibold">Drop your audio file</span> here</>}
                    </p>
                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Supporting MP3, WAV (Max {MAX_FILE_SIZE_LABEL})</p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="audio/mpeg, audio/wav, .mp3, .wav"
                    className="hidden"
                  />

                  {file && (
                    <div className="w-full mt-6">
                      <button
                        onClick={handleStart}
                        className="w-full py-5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl font-bold shadow-2xl shadow-indigo-500/30 flex items-center justify-center gap-3 transition-colors mt-2 uppercase tracking-wider"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        START EXTRACTION
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
                        <span className="text-slate-400 block">Status</span>
                        <span className="text-indigo-400 font-semibold animate-pulse">
                          {status === 'uploading' ? 'Uploading audio securely...' : 'Extracting stems using deep learning...'}
                          {status === 'uploading' && uploadProgress !== null ? ` ${uploadProgress}%` : ''}
                        </span>
                        {(statusDetail || (status === 'processing' && processingElapsed > 0)) && (
                          <span className="text-slate-500 block">
                            {statusDetail || `Modal is processing your audio (${formatElapsed(processingElapsed)} elapsed)...`}
                          </span>
                        )}
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
                      <p className="text-xs text-slate-500 mt-1 uppercase tracking-tight">Separation Complete · Links expire in 30 minutes</p>
                    </div>
                    <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded-md uppercase">Finished</span>
                  </div>

                  <div className="mt-4 pt-8 border-t border-white/5 flex flex-col gap-4">
                    {getStemEntries(result).map(([stem, stemResult]) => (
                       <div key={stem} className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                         <div className="flex items-center gap-4 w-full">
                           <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex flex-shrink-0 items-center justify-center text-indigo-400">
                             <FileAudio className="w-6 h-6" />
                           </div>
                           <div className="flex-1 w-full max-w-[200px] sm:max-w-xs">
                             <p className="text-sm font-semibold capitalize text-slate-200">{stem === 'other' ? 'Accompaniment (Other)' : stem}</p>
                             <audio controls src={getStemUrl(stemResult)} className="h-8 mt-2 w-full" />
                           </div>
                         </div>
                         <a
                            href={getStemUrl(stemResult, true)}
                            download={`${stem}-${file?.name}`}
                            className="px-6 py-3 shrink-0 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] sm:text-xs font-bold uppercase transition-all flex items-center gap-2"
                         >
                            <Download className="w-4 h-4" /> Download
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
                    className="mt-8 mx-auto px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors border border-white/5"
                  >
                    Process another track
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
                    <h3 className="text-xl font-bold text-white mb-2">Processing Failed</h3>
                    <p className="text-rose-400 mb-8 max-w-md">{errorMessage}</p>
                    
                    <button
                      onClick={() => setStatus('idle')}
                      className="px-6 py-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl transition-colors text-xs font-bold uppercase tracking-wider"
                    >
                      Try Again
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
  );
}
