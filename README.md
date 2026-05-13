# AI Vocal Remover

A React app for separating vocals from accompaniment in MP3/WAV files. Local development runs Demucs on your own machine; production is intended to run the heavy audio job on Modal, with Vercel hosting the UI.

## Current Features

- Drag-and-drop MP3/WAV upload
- 10 MB upload limit
- Local Demucs processing for development
- Optional Modal processing mode
- Vocal and accompaniment preview in the browser
- One-click download for separated stems
- Temporary source-file cleanup after each local task

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4
- Express + Multer
- Demucs / HTDemucs
- Modal + FastAPI for hosted GPU processing
- Vercel Blob planned for production file handoff

## Local Development

Local development does not use Vercel. The browser sends audio to the local Express server, and the server runs the `demucs` CLI on your computer.

Install Node dependencies:

```bash
npm install
```

Install local audio tools:

```bash
brew install ffmpeg
python3.11 -m venv .venv
.venv/bin/pip install demucs torchcodec
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Set the local processor:

```bash
AUDIO_PROCESSOR="local"
DEMUCS_COMMAND="./.venv/bin/demucs"
DEMUCS_DEVICE="cpu"
```

PyTorch works on macOS, including Apple Silicon. For this project, `cpu` is the most reliable local test device; it is slower than Modal's GPU, but it avoids MPS compatibility surprises. If you want to experiment after CPU works, try `DEMUCS_DEVICE="mps"` on Apple Silicon.

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Modal Mode

Use Modal mode when you want to test the deployed GPU backend from your local app.

Deploy the Modal backend:

```bash
modal deploy modal_app.py
```

Set these values in `.env.local`:

```bash
AUDIO_PROCESSOR="modal"
MODAL_WEBHOOK_URL="https://YOUR_WORKSPACE_NAME--uvr5-demucs-app-fastapi-app.modal.run/separate"
MODAL_AUTH_TOKEN="YOUR_SECRET_TOKEN"
```

`MODAL_AUTH_TOKEN` is optional. If you set it in the Modal app environment, set the same value locally so the Express proxy sends `Authorization: Bearer ...`.

## Vercel Deployment Plan

The current local `/api/separate` endpoint is useful for development, but production should avoid sending audio through a Vercel Function. Vercel Functions have payload limits, so production should use Vercel Blob as the file handoff layer:

1. The browser uploads a file up to 10 MB directly to Vercel Blob.
2. The app sends the Blob URL or pathname to Modal.
3. Modal downloads the source file, runs Demucs, uploads result stems, and deletes the source file promptly.
4. The browser receives the result URLs for playback and download.

Required Vercel environment variables for that production path:

```bash
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
MODAL_WEBHOOK_URL="https://YOUR_WORKSPACE_NAME--uvr5-demucs-app-fastapi-app.modal.run/separate"
MODAL_AUTH_TOKEN="YOUR_SECRET_TOKEN"
```

The Vercel Blob production handoff is the next implementation step. Local testing already works without Vercel once `demucs` is installed.

## Available Scripts

```bash
npm run dev      # Start the local Express server with Vite middleware
npm run build    # Build the frontend into dist/
npm run preview  # Preview the Vite production build
npm run lint     # Run TypeScript checks
npm run clean    # Remove dist/
```

## How Local Processing Works

1. The React app sends the selected audio file to `POST /api/separate`.
2. `server.ts` validates the 10 MB limit and writes the upload to a temporary directory.
3. The server runs `demucs --two-stems vocals -n htdemucs`.
4. The server reads `vocals.wav` and `no_vocals.wav` as data URLs.
5. The temporary source and output files are deleted.
6. The UI renders audio previews and download links for each stem.

## Notes

- The local server listens on port `3000`.
- Local processing speed depends on your machine.
- CPU mode is recommended first on macOS for reliability.
- The first Demucs run may download model weights.
- `ffmpeg` is required by Demucs.
