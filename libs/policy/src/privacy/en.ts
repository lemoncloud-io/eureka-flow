import type { PolicyContent } from '../types';

export const PRIVACY_POLICY_CONTENT_EN: PolicyContent = {
    title: 'Privacy Policy',
    subtitle: 'Eureka Flow Privacy Policy',
    currentVersion: 'v1.0',
    versions: [
        {
            version: 'v1.0',
            effectiveDate: 'March 5, 2025',
            sections: [
                {
                    title: 'Overview',
                    content:
                        'This Service places the highest priority on user privacy and does not retain unnecessary personal information for extended periods.',
                },
                {
                    title: '1. Items Collected and Purpose of Use',
                    content:
                        'The Company collects only the minimum information necessary to provide the Service.\n\n• API Key\n  - Purpose of collection and use: User authentication and service access control\n  - Retention and usage period: Immediately destroyed upon user withdrawal\n\n• Device Information and Logs\n  - Purpose of collection and use: Service error tracking, service optimization\n  - Retention and usage period: Immediately destroyed upon user withdrawal\n  - Information included: Technical data for service stabilization such as browser type, OS version, service error logs, etc.\n\n• Workflow and Node Execution Data\n  - Purpose of collection and use: Workflow storage, node execution, and result delivery\n  - Retention and usage period: Retained while account is active; destroyed upon user withdrawal\n  - Note: Data is transmitted in encrypted form.',
                },
                {
                    title: '2. Procedures and Methods of Personal Information Destruction',
                    content:
                        "The principle is to destroy users' personal information without delay once the purpose of collection has been fulfilled.\n\n• Immediate Destruction\nWhen a user chooses to withdraw or terminate the service, the collected information is destroyed immediately without any grace period.\n\n• Irrecoverable\nUpon destruction, information in electronic file format is deleted using technical methods that make it impossible to reproduce the records.",
                },
                {
                    title: '3. Workflow Data Management',
                    content:
                        "Workflow data created by users is stored on the Company's servers. The Company takes appropriate security measures to protect this data. Users may export or delete their workflow data at any time through the Service.",
                },
                {
                    title: '4. Use of Service Error Analysis Tools',
                    content:
                        'The Service may utilize external analysis tools to analyze service errors. The collected information is used solely for statistical purposes to improve service quality and is managed in a state where specific individuals cannot be identified.',
                },
                {
                    title: '5. Personal Information Protection Officer',
                    content:
                        'For inquiries regarding personal information during service use, please contact the following officer.\n\n• Officer: Hyungtak Jin\n• Contact: app@lemoncloud.io',
                },
            ],
        },
    ],
};
