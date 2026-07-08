import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { PublicPageShell } from '@/components/PublicPageShell';
import { PublicPageBackLink } from '@/components/PublicPageBackLink';
import type { LegalSection } from '@/content/privacy-policy';

function LegalSectionBlock({ section }: { section: LegalSection }) {
    return (
        <section className="support-section legal-section">
            <h2 className="support-section__label">{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="legal-section__body">
                    {paragraph}
                </p>
            ))}
            {section.bullets && section.bullets.length > 0 ? (
                <ul className="legal-section__list">
                    {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            ) : null}
            {section.subsections?.map((subsection) => (
                <div key={subsection.title || subsection.paragraphs?.[0]} className="legal-subsection">
                    {subsection.title ? (
                        <h3 className="legal-subsection__title">{subsection.title}</h3>
                    ) : null}
                    {subsection.paragraphs?.map((paragraph) => (
                        <p key={paragraph} className="legal-section__body">
                            {paragraph}
                        </p>
                    ))}
                    {subsection.bullets && subsection.bullets.length > 0 ? (
                        <ul className="legal-section__list">
                            {subsection.bullets.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ))}
        </section>
    );
}

type LegalDocumentPageProps = {
    title: string;
    effectiveDate: string;
    sections: LegalSection[];
    footer?: ReactNode;
};

export function LegalDocumentPage({
    title,
    effectiveDate,
    sections,
    footer,
}: LegalDocumentPageProps) {
    return (
        <PublicPageShell showSignIn={false}>
            <div className="support-page support-page--legal">
                <Suspense fallback={null}>
                    <PublicPageBackLink />
                </Suspense>
                <article className="support-card">
                    <h1 className="support-page__title">{title}</h1>
                    <p className="support-page__lead">Effective Date: {effectiveDate}</p>
                    {sections.map((section) => (
                        <LegalSectionBlock key={section.title} section={section} />
                    ))}
                    {footer}
                </article>
            </div>
        </PublicPageShell>
    );
}
