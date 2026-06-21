import Link from 'next/link';
import Logo from '@/components/Logo';

type Props = {
  title: string;
  html: string;
};

export default function LegalDocumentPage({ title, html }: Props) {
  return (
    <div className="legal-document-page">
      <header className="legal-document-page__header">
        <Link href="/home" className="legal-document-page__logo" aria-label="Back to home">
          <Logo />
        </Link>
        <Link href="/home" className="legal-document-page__back">
          ← Back to home
        </Link>
      </header>
      <main className="legal-document-page__main">
        <h1 className="legal-document-page__title">{title}</h1>
        <article
          className="legal-document-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
    </div>
  );
}
