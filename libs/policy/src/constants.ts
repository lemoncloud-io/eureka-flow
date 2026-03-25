import { PRIVACY_POLICY_CONTENT_EN } from './privacy/en';
import { PRIVACY_POLICY_CONTENT_KO } from './privacy/ko';
import { TERMS_OF_SERVICE_CONTENT_EN } from './terms/en';
import { TERMS_OF_SERVICE_CONTENT_KO } from './terms/ko';

import type { PolicyContent, PolicyType, PolicyVersion, SupportedLanguage } from './types';

export const TERMS_CONTENTS: Record<SupportedLanguage, PolicyContent> = {
    ko: TERMS_OF_SERVICE_CONTENT_KO,
    en: TERMS_OF_SERVICE_CONTENT_EN,
};

export const PRIVACY_CONTENTS: Record<SupportedLanguage, PolicyContent> = {
    ko: PRIVACY_POLICY_CONTENT_KO,
    en: PRIVACY_POLICY_CONTENT_EN,
};

const POLICY_CONTENTS: Record<PolicyType, Record<SupportedLanguage, PolicyContent>> = {
    terms: TERMS_CONTENTS,
    privacy: PRIVACY_CONTENTS,
};

export const getPolicyContent = (
    type: PolicyType,
    lang: SupportedLanguage
): { content: PolicyContent; currentVersion: PolicyVersion } | null => {
    const content = POLICY_CONTENTS[type][lang];
    const currentVersion = content.versions.find(v => v.version === content.currentVersion);
    if (!currentVersion) return null;
    return { content, currentVersion };
};
