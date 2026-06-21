import LegalDocumentPage from '@/components/LegalDocumentPage';
import { loadLegalDocumentHtml } from '@/lib/legalDocument';

export const metadata = {
  title: 'Terms of Use | Locum Link',
};

export default async function TermsPage() {
  const html = await loadLegalDocumentHtml('terms-of-use.docx');
  return <LegalDocumentPage title="Terms of Use" html={html} />;
}
