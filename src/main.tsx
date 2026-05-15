import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { CompliancePage, getCompliancePageKind } from './views/CompliancePages.tsx';
import { redirectDefaultVercelHost } from './lib/canonicalOrigin.ts';
import { LanguageProvider } from './lib/i18n.tsx';
import './index.css';

redirectDefaultVercelHost();

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

const compliancePageKind = getCompliancePageKind(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthGate>
        {(authProps) => (
          compliancePageKind ? (
            <CompliancePage kind={compliancePageKind} auth={authProps} />
          ) : (
            <App {...authProps} />
          )
        )}
      </AuthGate>
      <Analytics />
    </LanguageProvider>
  </StrictMode>,
);
