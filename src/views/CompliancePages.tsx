import { useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Languages } from 'lucide-react';
import { openPaddleCheckout } from '../lib/paddle';
import { trackEvent } from '../lib/events';
import { useLanguage } from '../lib/i18n';

const updatedAt = 'May 14, 2026';
const supportEmail = 'support@uulili.com';

type PageKind = 'pricing' | 'terms' | 'privacy' | 'refund';
type AuthProps = {
  session: Session | null;
};

function LanguageToggle() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/10"
      aria-label="Toggle language"
    >
      <Languages className="h-3.5 w-3.5" />
      {t('header.lang_switch')}
    </button>
  );
}

function PageShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            {t('page.back')}
          </a>
          <LanguageToggle />
        </div>
        <header className="mt-10 border-b border-white/10 pb-8">
          <p className="text-sm text-indigo-300">AI Vocal Remover</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">{description}</p>
          <p className="mt-4 text-xs text-zinc-500">{t('page.last_updated', { date: updatedAt })}</p>
        </header>
        <div className="prose prose-invert prose-zinc mt-8 max-w-none prose-headings:text-white prose-a:text-indigo-300">
          {children}
        </div>
        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-zinc-500">
          {t('page.contact_prefix')}<a className="text-indigo-300" href={`mailto:${supportEmail}`}>{supportEmail}</a>{t('page.contact_suffix')}
        </footer>
      </div>
    </main>
  );
}

function PricingPage({ auth }: { auth?: AuthProps }) {
  const { t } = useLanguage();
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutPlan, setCheckoutPlan] = useState<'pro_monthly' | 'pro_yearly' | null>(null);

  const startCheckout = async (plan: 'pro_monthly' | 'pro_yearly') => {
    if (!auth?.session) {
      window.dispatchEvent(new Event('open-auth-panel'));
      return;
    }

    setCheckoutError('');
    setCheckoutPlan(plan);
    try {
      trackEvent(auth.session, 'pricing_checkout_clicked', { plan, page: 'pricing' });
      await openPaddleCheckout({ plan, session: auth.session });
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : t('pricing.unable_checkout'));
    } finally {
      setCheckoutPlan(null);
    }
  };

  const proPlans = [
    {
      plan: 'pro_monthly' as const,
      name: t('pricing.pro_monthly_name'),
      price: t('pricing.pro_monthly_price'),
      copy: t('pricing.pro_monthly_copy'),
      accent: 'border-indigo-400/40 bg-indigo-500/10 hover:bg-indigo-500/20',
    },
    {
      plan: 'pro_yearly' as const,
      name: t('pricing.pro_yearly_name'),
      price: t('pricing.pro_yearly_price'),
      copy: t('pricing.pro_yearly_copy'),
      accent: 'border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20',
    },
  ];

  const billingLinks = t('pricing.billing_links', {
    terms: '__TERMS__',
    privacy: '__PRIVACY__',
    refund: '__REFUND__',
  });
  const billingParts = billingLinks.split(/(__TERMS__|__PRIVACY__|__REFUND__)/g);

  return (
    <PageShell title={t('pricing.title')} description={t('pricing.description')}>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold">{t('pricing.free_name')}</h2>
          <p className="mt-2 text-3xl font-bold text-white">{t('pricing.free_price')}</p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{t('pricing.free_copy')}</p>
          <a
            href="/"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10"
          >
            {t('pricing.start_free')}
          </a>
        </section>
        {proPlans.map(({ plan, name, price, copy, accent }) => (
          <section key={name} className={`rounded-lg border p-5 ${accent}`}>
            <h2 className="text-lg font-semibold text-white">{name}</h2>
            <p className="mt-2 text-3xl font-bold text-white">{price}</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{copy}</p>
            <button
              type="button"
              onClick={() => void startCheckout(plan)}
              disabled={checkoutPlan === plan}
              className="mt-5 h-11 w-full rounded-lg bg-white px-4 text-sm font-bold text-zinc-950 hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-70"
            >
              {checkoutPlan === plan ? t('pricing.opening_checkout') : t('pricing.buy_with_paddle')}
            </button>
          </section>
        ))}
      </div>
      {checkoutError && (
        <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {checkoutError}
        </p>
      )}
      <h2>{t('pricing.included')}</h2>
      <ul>
        <li>{t('pricing.included_1')}</li>
        <li>{t('pricing.included_2')}</li>
        <li>{t('pricing.included_3')}</li>
      </ul>
      <h2>{t('pricing.billing')}</h2>
      <p>{t('pricing.billing_copy')}</p>
      <p>
        {billingParts.map((part, idx) => {
          if (part === '__TERMS__') return <a key={idx} href="/terms">{t('footer.terms')}</a>;
          if (part === '__PRIVACY__') return <a key={idx} href="/privacy">{t('footer.privacy')}</a>;
          if (part === '__REFUND__') return <a key={idx} href="/refund-policy">{t('footer.refund')}</a>;
          return <span key={idx}>{part}</span>;
        })}
      </p>
    </PageShell>
  );
}

function TermsPage() {
  const { t } = useLanguage();

  return (
    <PageShell title={t('terms.title')} description={t('terms.description')}>
      <h2>{t('terms.h1')}</h2>
      <p>{t('terms.p1')}</p>
      <h2>{t('terms.h2')}</h2>
      <p>{t('terms.p2')}</p>
      <h2>{t('terms.h3')}</h2>
      <p>{t('terms.p3')}</p>
      <h2>{t('terms.h4')}</h2>
      <ul>
        <li>{t('terms.p4_1')}</li>
        <li>{t('terms.p4_2')}</li>
        <li>{t('terms.p4_3')}</li>
        <li>{t('terms.p4_4')}</li>
      </ul>
      <h2>{t('terms.h5')}</h2>
      <p>{t('terms.p5')}</p>
      <h2>{t('terms.h6')}</h2>
      <p>{t('terms.p6')}</p>
      <h2>{t('terms.h7')}</h2>
      <p>{t('terms.p7')}</p>
      <h2>{t('terms.h8')}</h2>
      <p>
        {t('terms.p8_prefix')}<a href={`mailto:${supportEmail}`}>{supportEmail}</a>{t('terms.p8_suffix')}
      </p>
    </PageShell>
  );
}

function PrivacyPage() {
  const { t } = useLanguage();

  return (
    <PageShell title={t('privacy.title')} description={t('privacy.description')}>
      <h2>{t('privacy.h1')}</h2>
      <ul>
        <li>{t('privacy.p1_1')}</li>
        <li>{t('privacy.p1_2')}</li>
        <li>{t('privacy.p1_3')}</li>
        <li>{t('privacy.p1_4')}</li>
      </ul>
      <h2>{t('privacy.h2')}</h2>
      <p>{t('privacy.p2')}</p>
      <h2>{t('privacy.h3')}</h2>
      <p>{t('privacy.p3')}</p>
      <h2>{t('privacy.h4')}</h2>
      <p>{t('privacy.p4')}</p>
      <h2>{t('privacy.h5')}</h2>
      <p>{t('privacy.p5')}</p>
      <h2>{t('privacy.h6')}</h2>
      <p>
        {t('privacy.p6_prefix')}<a href={`mailto:${supportEmail}`}>{supportEmail}</a>{t('privacy.p6_suffix')}
      </p>
    </PageShell>
  );
}

function RefundPage() {
  const { t } = useLanguage();

  return (
    <PageShell title={t('refund.title')} description={t('refund.description')}>
      <h2>{t('refund.h1')}</h2>
      <p>{t('refund.p1')}</p>
      <h2>{t('refund.h2')}</h2>
      <ul>
        <li>{t('refund.p2_1')}</li>
        <li>{t('refund.p2_2')}</li>
        <li>{t('refund.p2_3')}</li>
      </ul>
      <h2>{t('refund.h3')}</h2>
      <ul>
        <li>{t('refund.p3_1')}</li>
        <li>{t('refund.p3_2')}</li>
        <li>{t('refund.p3_3')}</li>
        <li>{t('refund.p3_4')}</li>
      </ul>
      <h2>{t('refund.h4')}</h2>
      <p>
        {t('refund.p4_prefix')}<a href={`mailto:${supportEmail}`}>{supportEmail}</a>{t('refund.p4_suffix')}
      </p>
      <h2>{t('refund.h5')}</h2>
      <p>{t('refund.p5')}</p>
    </PageShell>
  );
}

export function CompliancePage({ kind, auth }: { kind: PageKind; auth?: AuthProps }) {
  if (kind === 'pricing') return <PricingPage auth={auth} />;
  if (kind === 'terms') return <TermsPage />;
  if (kind === 'privacy') return <PrivacyPage />;
  return <RefundPage />;
}

export function getCompliancePageKind(pathname: string): PageKind | null {
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/terms' || pathname === '/terms-and-conditions') return 'terms';
  if (pathname === '/privacy' || pathname === '/privacy-policy') return 'privacy';
  if (pathname === '/refund-policy' || pathname === '/refund') return 'refund';
  return null;
}
