import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Store uploads in memory before forwarding them to the Modal backend.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  });

  app.use(express.json({ limit: '50mb' }));

  // Separate endpoint
  app.post('/api/separate', upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
      }

      if (!process.env.MODAL_WEBHOOK_URL) {
        return res.status(500).json({ 
          error: 'Missing MODAL_WEBHOOK_URL. Deploy modal_app.py on Modal, then set the webhook URL in .env.local.' 
        });
      }

      console.log('Sending to Modal backend...');
      // We use native fetch and FormData available in Node >= 18
      const blob = new Blob([req.file.buffer]);
      const formData = new FormData();
      formData.append('audio', blob, req.file.originalname);
      
      const headers: Record<string, string> = {};
      if (process.env.MODAL_AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.MODAL_AUTH_TOKEN}`;
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

      const output = modalData.stems;
      
      res.json({ success: true, stems: output });
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
