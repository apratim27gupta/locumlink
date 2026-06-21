import LegalDocumentPage from '@/components/LegalDocumentPage';
import { loadLegalDocumentHtml } from '@/lib/legalDocument';

export const metadata = {
  title: 'Privacy Policy | Locum Link',
};

export default async function PrivacyPage() {
  const html = await loadLegalDocumentHtml('privacy-policy.docx');
  return <LegalDocumentPage title="Privacy Policy" html={html} />;
}
