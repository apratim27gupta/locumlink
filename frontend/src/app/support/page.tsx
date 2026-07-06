import Link from 'next/link';
import { PublicPageShell } from '@/components/PublicPageShell';
import { SupportLegalLinks } from '@/components/SupportLegalLinks';
import { contactSupportMailtoHref, getSupportEmail } from '@/lib/support';

export default function SupportPage() {
    const email = getSupportEmail();
    const mailtoHref = contactSupportMailtoHref();

    return (
        <PublicPageShell showSignIn={false}>
            <div className="support-page">
                <article className="support-card">
                    <h1 className="support-page__title">Support</h1>
                    <p className="support-page__lead">
                        Need help with Locum Link? Contact our team for account, billing, or platform questions.
                    </p>

                    <section className="support-section">
                        <h2 className="support-section__label">Contact</h2>
                        <p className="support-section__body">
                            Email us at{' '}
                            <a href={mailtoHref} className="support-text-link">
                                {email}
                            </a>
                            . We typically respond within one business day.
                        </p>
                    </section>

                    <section className="support-section support-section--last">
                        <h2 className="support-section__label">Legal</h2>
                        <div className="support-legal-links">
                            <SupportLegalLinks variant="landing" />
                        </div>
                    </section>
                </article>

                <p className="support-page__back">
                    <Link href="/home" className="support-text-link">
                        ← Back to home
                    </Link>
                </p>
            </div>
        </PublicPageShell>
    );
}
