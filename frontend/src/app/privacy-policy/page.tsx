import { LegalDocumentPage } from '@/components/LegalDocumentPage';
import { PRIVACY_POLICY } from '@/content/privacy-policy';

export default function PrivacyPolicyPage() {
    return (
        <LegalDocumentPage
            title={PRIVACY_POLICY.title}
            effectiveDate={PRIVACY_POLICY.effectiveDate}
            sections={PRIVACY_POLICY.sections}
        />
    );
}
