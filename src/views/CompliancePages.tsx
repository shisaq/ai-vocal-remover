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
      className="toon-btn toon-btn-sky text-xs"
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
    <main className="min-h-screen px-6 py-10 text-[#305066] relative overflow-hidden">
      <svg className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 opacity-70" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#db6968" stroke="#305066" strokeWidth="4"/></svg>
      <svg className="pointer-events-none absolute bottom-20 -left-10 w-32 h-32 opacity-70" viewBox="0 0 100 100"><rect x="15" y="15" width="70" height="70" rx="18" fill="#0ea8e3" stroke="#305066" strokeWidth="4" transform="rotate(8 50 50)"/></svg>
      <div className="mx-auto max-w-4xl relative z-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <a href="/" className="toon-btn text-sm">
            <ArrowLeft className="h-4 w-4" />
            {t('page.back')}
          </a>
          <LanguageToggle />
        </div>
        <header className="mt-8 toon-card p-7">
          <p className="font-display text-base text-[#db6968]">AI Vocal Remover</p>
          <h1 className="mt-2 font-display text-5xl text-[#305066] leading-[1.05]">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#305066]/85 font-bold">{description}</p>
          <p className="mt-4 text-xs text-[#305066]/60 font-extrabold uppercase tracking-wider">{t('page.last_updated', { date: updatedAt })}</p>
        </header>
        <div className="mt-6 toon-card p-7 max-w-none prose-headings:text-[#305066] prose-headings:font-display prose-h2:text-2xl prose-h2:mt-6 prose-h2:mb-2 prose-a:text-[#0ea8e3] prose-a:font-extrabold prose-strong:text-[#305066] prose-li:my-1 prose-p:text-[#305066]/85 prose-p:font-semibold prose-ul:text-[#305066]/85 text-[15px]">
          {children}
        </div>
        <footer className="mt-8 toon-card-cream p-5 text-sm font-bold">
          {t('page.contact_prefix')}<a className="text-[#db6968] underline decoration-wavy" href={`mailto:${supportEmail}`}>{supportEmail}</a>{t('page.contact_suffix')}
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
      <div className="not-prose grid gap-5 md:grid-cols-3">
        <section className="toon-card-cream p-5 flex flex-col">
          <h2 className="font-display text-xl text-[#305066]">{t('pricing.free_name')}</h2>
          <p className="mt-2 font-display text-4xl text-[#db6968]">{t('pricing.free_price')}</p>
          <p className="mt-3 text-sm leading-6 text-[#305066]/85 font-bold flex-1">{t('pricing.free_copy')}</p>
          <a href="/" className="mt-5 toon-btn text-sm">
            {t('pricing.start_free')}
          </a>
        </section>
        {proPlans.map(({ plan, name, price, copy }, idx) => (
          <section key={name} className={idx === 0 ? 'toon-card-pink p-5 flex flex-col' : 'toon-card-sky p-5 flex flex-col'}>
            <h2 className="font-display text-xl text-[#fff8ea]">{name}</h2>
            <p className="mt-2 font-display text-4xl text-[#fff8ea]">{price}</p>
            <p className="mt-3 text-sm leading-6 text-[#fff8ea]/95 font-bold flex-1">{copy}</p>
            <button
              type="button"
              onClick={() => void startCheckout(plan)}
              disabled={checkoutPlan === plan}
              className="mt-5 toon-btn toon-btn-ink text-sm"
            >
              {checkoutPlan === plan ? t('pricing.opening_checkout') : t('pricing.buy_with_paddle')}
            </button>
          </section>
        ))}
      </div>
      {checkoutError && (
        <p className="not-prose mt-5 rounded-2xl border-[3px] border-[#305066] bg-[#db6968] px-4 py-3 text-sm text-[#fff8ea] font-bold shadow-[3px_3px_0_#305066]">
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
