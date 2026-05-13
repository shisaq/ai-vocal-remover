import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';
import os from 'os';
import { spawn } from 'child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

dotenv.config();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_LABEL = '10MB';

type StemUrls = Record<'vocals' | 'other', string>;

function getProcessor() {
  if (process.env.AUDIO_PROCESSOR) {
    return process.env.AUDIO_PROCESSOR;
  }

  return process.env.NODE_ENV === 'production' ? 'modal' : 'local';
}

function getDemucsCommand() {
  if (process.env.DEMUCS_COMMAND) {
    return process.env.DEMUCS_COMMAND;
  }

  const localVenvCommand = path.join(process.cwd(), '.venv', 'bin', 'demucs');
  return existsSync(localVenvCommand) ? localVenvCommand : 'demucs';
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'input.wav';
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) {
        stderr = stderr.slice(-8000);
      }
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new Error('Demucs is not installed or not available on PATH. Install it with `python -m pip install demucs`, then restart the dev server.'));
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Demucs exited with code ${code}.${stderr ? `\n${stderr}` : ''}`));
    });
  });
}

async function separateLocally(file: Express.Multer.File): Promise<StemUrls> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ai-vocal-remover-'));

  try {
    const safeFilename = sanitizeFilename(file.originalname);
    const inputPath = path.join(tempDir, safeFilename);
    const outputDir = path.join(tempDir, 'output');

    await mkdir(outputDir, { recursive: true });
    await writeFile(inputPath, file.buffer);

    const demucsArgs = [
      '--two-stems',
      'vocals',
      '-n',
      'htdemucs',
      '--out',
      outputDir,
      inputPath,
    ];

    if (process.env.DEMUCS_DEVICE) {
      demucsArgs.splice(0, 0, '--device', process.env.DEMUCS_DEVICE);
    }

    await runCommand(getDemucsCommand(), demucsArgs, tempDir);

    const trackName = path.parse(safeFilename).name;
    let trackDir = path.join(outputDir, 'htdemucs', trackName);

    if (!existsSync(trackDir)) {
      const htdemucsDir = path.join(outputDir, 'htdemucs');
      const { readdir } = await import('fs/promises');
      const [firstTrack] = await readdir(htdemucsDir);
      trackDir = path.join(htdemucsDir, firstTrack);
    }

    const vocals = await readFile(path.join(trackDir, 'vocals.wav'));
    const other = await readFile(path.join(trackDir, 'no_vocals.wav'));

    return {
      vocals: `data:audio/wav;base64,${vocals.toString('base64')}`,
      other: `data:audio/wav;base64,${other.toString('base64')}`,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function separateWithModal(file: Express.Multer.File): Promise<StemUrls> {
  if (!process.env.MODAL_WEBHOOK_URL) {
    throw new Error('Missing MODAL_WEBHOOK_URL. Deploy modal_app.py on Modal, then set the webhook URL in .env.local.');
  }

  console.log('Sending to Modal backend...');
  const blob = new Blob([file.buffer]);
  const formData = new FormData();
  formData.append('audio', blob, file.originalname);

  const headers: Record<string, string> = {};
  if (process.env.MODAL_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${process.env.MODAL_AUTH_TOKEN}`;
  }

  const modalResponse = await fetch(process.env.MODAL_WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!modalResponse.ok) {
    const errText = await modalResponse.text();
    throw new Error(`Modal API Error: ${modalResponse.status} ${errText}`);
  }

  const modalData = await modalResponse.json();

  if (!modalData.success) {
    throw new Error(modalData.error || 'Unknown error from Modal backend');
  }

  return modalData.stems;
}

function handleUpload(req: Request, res: Response, upload: ReturnType<typeof multer>['single']) {
  return new Promise<void>((resolve, reject) => {
    upload('audio')(req, res, (error) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        reject(new Error(`Audio file is too large. Maximum size is ${MAX_UPLOAD_LABEL}.`));
        return;
      }

      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  app.use(express.json({ limit: MAX_UPLOAD_LABEL }));

  app.post('/api/separate', async (req, res) => {
    try {
      await handleUpload(req, res, upload.single.bind(upload));

      if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
      }

      const processor = getProcessor();
      let stems: StemUrls;

      if (processor === 'local') {
        stems = await separateLocally(req.file);
      } else if (processor === 'modal') {
        stems = await separateWithModal(req.file);
      } else {
        throw new Error(`Unsupported AUDIO_PROCESSOR "${processor}". Use "local" or "modal".`);
      }

      res.json({ success: true, stems });
    } catch (error) {
      console.error('Separation error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error occurred during separation.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
