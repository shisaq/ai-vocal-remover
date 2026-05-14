import type { ReactNode } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

const updatedAt = 'May 14, 2026';
const supportEmail = 'support@uulili.com';

type PageKind = 'pricing' | 'terms' | 'privacy' | 'refund';

function PageShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to AI Vocal Remover
        </a>
        <header className="mt-10 border-b border-white/10 pb-8">
          <p className="text-sm text-indigo-300">AI Vocal Remover</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">{description}</p>
          <p className="mt-4 text-xs text-zinc-500">Last updated: {updatedAt}</p>
        </header>
        <div className="prose prose-invert prose-zinc mt-8 max-w-none prose-headings:text-white prose-a:text-indigo-300">
          {children}
        </div>
        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-zinc-500">
          Questions? Contact <a className="text-indigo-300" href={`mailto:${supportEmail}`}>{supportEmail}</a>.
        </footer>
      </div>
    </main>
  );
}

function PricingPage() {
  return (
    <PageShell
      title="Pricing"
      description="Simple plans for creators who need clean vocals, accompaniment, drums, bass, and other stems for lawful personal creative use."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Free', '$0', '3 jobs per month, up to 5 minutes, up to 15 MB, vocals and accompaniment stems.'],
          ['Pro Monthly', '$4.99 / month', 'Up to 15 minutes, up to 100 MB, 4-stem output, high-fidelity mode, 30-day history.'],
          ['Pro Yearly', '$34.99 / year', 'The same Pro features with annual billing and 90-day history retention.'],
        ].map(([name, price, copy]) => (
          <section key={name} className="rounded-lg border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">{name}</h2>
            <p className="mt-2 text-3xl font-bold text-white">{price}</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{copy}</p>
          </section>
        ))}
      </div>
      <h2>Included</h2>
      <ul>
        <li>Upload MP3/WAV audio or import supported public media links.</li>
        <li>Generate downloadable stems for cover songs, remix drafts, practice tracks, and short-form video creation.</li>
        <li>Temporary file processing with result links available for the retention period shown in the product.</li>
      </ul>
      <h2>Billing</h2>
      <p>
        Paid subscriptions renew automatically unless canceled before the next billing date. Billing is processed by our payment
        provider. You can manage or cancel your subscription from the billing portal after purchase.
      </p>
      <p>
        See our <a href="/terms">Terms of Service</a>, <a href="/privacy">Privacy Policy</a>, and{' '}
        <a href="/refund-policy">Refund Policy</a> before purchasing.
      </p>
    </PageShell>
  );
}

function TermsPage() {
  return (
    <PageShell
      title="Terms of Service"
      description="These terms explain how you may use AI Vocal Remover and what responsibilities apply when processing audio."
    >
      <h2>1. Service</h2>
      <p>
        AI Vocal Remover provides online audio stem separation tools for creators. You may upload audio files or submit supported
        public media links to generate separated stems such as vocals, accompaniment, drums, bass, and other audio tracks.
      </p>
      <h2>2. Accounts</h2>
      <p>
        You are responsible for keeping your account secure and for all activity under your account. We may limit, suspend, or
        terminate access if we detect abuse, fraud, excessive automated use, or violations of these terms.
      </p>
      <h2>3. Lawful Use and Copyright</h2>
      <p>
        You may only process audio that you own, are licensed to use, or are otherwise legally permitted to process. The service is
        intended for lawful personal creative use, including cover practice, remix drafts, education, and short-form video creation.
        You are responsible for obtaining any permissions needed before publishing, distributing, monetizing, or commercially using
        generated stems.
      </p>
      <h2>4. Prohibited Use</h2>
      <ul>
        <li>Do not use the service to infringe copyright or other rights.</li>
        <li>Do not upload illegal, harmful, or privacy-invasive content.</li>
        <li>Do not attempt to reverse engineer, overload, scrape, or disrupt the service.</li>
        <li>Do not resell the service or generated files as a standalone stem extraction service without permission.</li>
      </ul>
      <h2>5. Payments and Subscriptions</h2>
      <p>
        Paid plans are billed according to the pricing shown at checkout. Subscriptions renew automatically unless canceled before
        renewal. Plan limits, file size limits, processing models, job retention, and concurrency may vary by plan.
      </p>
      <h2>6. Availability</h2>
      <p>
        Audio processing depends on third-party infrastructure and model availability. We try to keep the service reliable, but we do
        not guarantee uninterrupted access or perfect separation quality for every audio file.
      </p>
      <h2>7. Limitation of Liability</h2>
      <p>
        To the fullest extent allowed by law, AI Vocal Remover is provided as is. We are not liable for indirect damages, lost profits,
        lost data, copyright claims arising from your use of content, or losses beyond the amount you paid for the service in the
        previous month.
      </p>
      <h2>8. Contact</h2>
      <p>
        For support, billing issues, or rights concerns, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
    </PageShell>
  );
}

function PrivacyPage() {
  return (
    <PageShell
      title="Privacy Policy"
      description="This policy describes what data we collect, why we collect it, and how we handle uploaded audio and account data."
    >
      <h2>Information We Collect</h2>
      <ul>
        <li>Account information such as email address, login provider, plan, and subscription status.</li>
        <li>Uploaded audio files, imported source URLs, filenames, generated stems, job status, and processing logs.</li>
        <li>Payment and billing metadata from payment providers. We do not store full card numbers.</li>
        <li>Usage analytics such as registration, upload, completion, and upgrade events.</li>
      </ul>
      <h2>How We Use Information</h2>
      <p>
        We use data to provide audio processing, enforce plan limits, maintain job history, process payments, prevent abuse, improve
        the product, and respond to support requests.
      </p>
      <h2>Audio Files</h2>
      <p>
        Source files are processed to generate stems and may be temporarily stored by our storage and processing providers. Result
        files are retained according to the plan and in-product retention period. You should not upload content that you are not
        legally permitted to process.
      </p>
      <h2>Service Providers</h2>
      <p>
        We rely on third-party providers for authentication, hosting, storage, analytics, payments, and audio processing. These
        providers process data only as needed to operate the service.
      </p>
      <h2>Your Choices</h2>
      <p>
        You may request deletion of your account or job history by contacting us. Some billing records may be retained where required
        for tax, fraud prevention, accounting, or legal compliance.
      </p>
      <h2>Contact</h2>
      <p>
        Privacy requests can be sent to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
    </PageShell>
  );
}

function RefundPage() {
  return (
    <PageShell
      title="Refund Policy"
      description="This policy explains when refunds may be granted for AI Vocal Remover subscriptions and purchases."
    >
      <h2>Summary</h2>
      <p>
        AI Vocal Remover is a digital service that consumes processing resources when jobs are started. We review refund requests
        fairly, especially where a payment was accidental, duplicated, or the service failed to deliver usable access.
      </p>
      <h2>Eligible Refunds</h2>
      <ul>
        <li>Duplicate charges for the same account and billing period.</li>
        <li>Accidental purchase requests submitted within 7 days, provided the paid plan has not been substantially used.</li>
        <li>Technical failure where paid processing could not be completed and we cannot reasonably resolve the issue.</li>
      </ul>
      <h2>Usually Not Refundable</h2>
      <ul>
        <li>Completed audio jobs where stems were successfully generated and downloaded.</li>
        <li>Requests based only on dissatisfaction with the artistic quality of a specific source file.</li>
        <li>Subscription renewals not canceled before the renewal date, except where required by law.</li>
        <li>Use that violates our Terms of Service or copyright policy.</li>
      </ul>
      <h2>How to Request a Refund</h2>
      <p>
        Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your account email, payment date, order ID if available, and
        a short explanation. We usually respond within 5 business days.
      </p>
      <h2>Cancellation</h2>
      <p>
        You may cancel a subscription from the billing portal. Cancellation stops future renewals but does not automatically refund the
        current billing period unless this policy or applicable law requires it.
      </p>
    </PageShell>
  );
}

export function CompliancePage({ kind }: { kind: PageKind }) {
  if (kind === 'pricing') return <PricingPage />;
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
