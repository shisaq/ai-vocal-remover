# AI Vocal Remover

A local React app for separating vocals from accompaniment in MP3/WAV files. The UI uploads audio to a local Express server, which forwards the file to a Modal GPU backend running Demucs with the `htdemucs` model.

## Features

- Drag-and-drop MP3/WAV upload
- 50 MB local upload limit
- Vocal and accompaniment preview in the browser
- One-click download for separated stems
- Optional bearer-token protection for the Modal endpoint

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4
- Express + Multer
- Modal + FastAPI
- Demucs / HTDemucs

## Prerequisites

- Node.js 18 or newer
- npm
- A Modal account and Modal CLI for the GPU backend
- Python environment with `modal` installed for deploying `modal_app.py`

## Setup

Install frontend and local server dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Deploy the Modal backend:

```bash
modal deploy modal_app.py
```

Set `MODAL_WEBHOOK_URL` in `.env.local` to the deployed FastAPI endpoint, including the `/separate` route:

```bash
MODAL_WEBHOOK_URL="https://YOUR_WORKSPACE_NAME--uvr5-demucs-app-fastapi-app.modal.run/separate"
```

`MODAL_AUTH_TOKEN` is optional. If you set it in the Modal app environment, set the same value locally so the Express proxy sends `Authorization: Bearer ...`.

## Run Locally

Start the local Express + Vite development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Available Scripts

```bash
npm run dev      # Start the local Express server with Vite middleware
npm run build    # Build the frontend into dist/
npm run preview  # Preview the Vite production build
npm run lint     # Run TypeScript checks
npm run clean    # Remove dist/
```

## How It Works

1. The React app sends the selected audio file to `POST /api/separate`.
2. `server.ts` validates the upload and forwards it to `MODAL_WEBHOOK_URL`.
3. `modal_app.py` runs Demucs with `--two-stems vocals -n htdemucs`.
4. The Modal backend returns base64 WAV data URLs for `vocals` and `other`.
5. The UI renders audio previews and download links for each stem.

## Notes

- The local server listens on port `3000`.
- Uploads are kept in memory before being forwarded to Modal.
- Processing can take a while depending on file length and Modal cold starts.
- The Modal function currently uses a T4 GPU and has a 600-second timeout.
