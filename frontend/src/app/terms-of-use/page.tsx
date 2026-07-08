import { LegalDocumentPage } from '@/components/LegalDocumentPage';
import { TERMS_OF_USE } from '@/content/terms-of-use';

export default function TermsOfUsePage() {
    return (
        <LegalDocumentPage
            title={TERMS_OF_USE.title}
            effectiveDate={TERMS_OF_USE.effectiveDate}
            sections={TERMS_OF_USE.sections}
        />
    );
}
