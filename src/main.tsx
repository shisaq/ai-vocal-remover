import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { CompliancePage, getCompliancePageKind } from './views/CompliancePages.tsx';
import './index.css';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

const compliancePageKind = getCompliancePageKind(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {compliancePageKind ? (
      <CompliancePage kind={compliancePageKind} />
    ) : (
      <AuthGate>
        {(authProps) => <App {...authProps} />}
      </AuthGate>
    )}
    <Analytics />
  </StrictMode>,
);
