import { motion } from 'framer-motion'
import Icon from '../components/Icon'
import { useNavigate } from 'react-router-dom'

interface Section {
  id: string
  title: string
  content: string
  subsections?: { title: string; content: string }[]
}

export default function PrivacyPage() {
  const navigate = useNavigate()

  const sections: Section[] = [
    {
      id: 'intro',
      title: 'Introduction',
      content:
        'Sierro Inc. ("Sierro," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Sierro App. By using the App, you consent to the data practices described in this policy.',
    },
    {
      id: 'collection',
      title: '1. Information We Collect',
      content:
        'We collect information to provide and improve the App. The types of information we collect depend on how you use the App.',
      subsections: [
        {
          title: '1.1 Account Information',
          content:
            'When you register: account name, email address or phone number, and encrypted password. If you use third-party sign-in (Google, Apple), we receive the authentication tokens and basic profile information authorized by those providers.',
        },
        {
          title: '1.2 Device & Usage Data',
          content:
            'We collect data from connected Sierro devices: battery level, charging/discharging status, power input/output (W), temperature, cycle count, and operational mode. We also collect app usage analytics: feature usage, session duration, crash reports, and performance metrics.',
        },
        {
          title: '1.3 Location Data',
          content:
            'With your explicit permission, we may access your device\'s Bluetooth and location services to discover nearby Sierro devices during the provisioning process. Location data is not stored or shared.',
        },
        {
          title: '1.4 Technical Information',
          content:
            'Automatically collected: device model, operating system version, app version, IP address, and network connection type. This helps us diagnose issues and optimize performance.',
        },
      ],
    },
    {
      id: 'cookies',
      title: '2. Cookies & Tracking Technologies',
      content:
        'The Sierro App does not use browser cookies. However, we may use local storage to save your preferences (e.g., notification settings, display options) and authentication tokens for session persistence. These are stored locally on your device and can be cleared via Settings > Reset App.',
    },
    {
      id: 'usage',
      title: '3. How We Use Your Information',
      content:
        'We use the collected information for the following purposes:',
      subsections: [
        {
          title: '3.1 Service Provision',
          content:
            'To authenticate your account, connect and control your Sierro devices, display real-time power data, and provide smart scheduling features.',
        },
        {
          title: '3.2 Improvement & Analytics',
          content:
            'To analyze usage patterns, identify bugs, and improve the App experience. Aggregated and anonymized data may be used for product development.',
        },
        {
          title: '3.3 Communication',
          content:
            'To send push notifications (power outage alerts, low battery warnings), account-related messages, and optional product updates. You can manage notification preferences in Settings.',
        },
        {
          title: '3.4 Security',
          content:
            'To detect and prevent fraud, unauthorized access, and abuse of the App.',
        },
      ],
    },
    {
      id: 'sharing',
      title: '4. How We Share Your Information',
      content:
        'We do not sell your personal information. We share your data only in the following circumstances:',
      subsections: [
        {
          title: '4.1 With Your Consent',
          content:
            'We may share your information with third parties when you explicitly authorize us to do so.',
        },
        {
          title: '4.2 Service Providers',
          content:
            'We engage trusted third-party providers for cloud infrastructure, push notification delivery, and analytics. These providers are contractually bound to protect your data and use it only for the services we request.',
        },
        {
          title: '4.3 Legal Obligations',
          content:
            'We may disclose information if required by law, court order, or governmental regulation, or to protect the rights, property, or safety of Sierro, our users, or the public.',
        },
        {
          title: '4.4 Business Transfers',
          content:
            'In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of the transaction, subject to the same privacy protections.',
        },
      ],
    },
    {
      id: 'storage',
      title: '5. Data Storage & Security',
      content:
        'We implement appropriate technical and organizational measures to protect your data:',
      subsections: [
        {
          title: '5.1 Encryption',
          content:
            'All data transmitted between the App and our servers is encrypted using TLS 1.3. Device data is encrypted at rest using AES-256. Passwords are hashed and never stored in plain text.',
        },
        {
          title: '5.2 Local Storage',
          content:
            'App preferences, cached device data, and session tokens are stored locally on your device using IndexedDB. You can clear this data at any time via Settings > Reset App.',
        },
        {
          title: '5.3 Data Retention',
          content:
            'We retain your personal information only as long as necessary to provide the services or as required by law. Deleted account data is permanently removed within 30 days.',
        },
        {
          title: '5.4 Security Incidents',
          content:
            'In the event of a data breach affecting your personal information, we will notify you and relevant authorities as required by applicable law.',
        },
      ],
    },
    {
      id: 'rights',
      title: '6. Your Rights',
      content:
        'Depending on your jurisdiction, you may have the following rights regarding your personal information:',
      subsections: [
        {
          title: '6.1 Access & Portability',
          content:
            'You may request a copy of your personal data in a portable format. Contact us at support@sierro.com.',
        },
        {
          title: '6.2 Correction',
          content:
            'You may update your account information at any time through Settings > Manage Account > Personal Info.',
        },
        {
          title: '6.3 Deletion',
          content:
            'You may delete your account and associated data through Settings > Delete Account. We will process deletion requests within 15 business days.',
        },
        {
          title: '6.4 Opt-Out',
          content:
            'You can disable push notifications in Settings at any time. For marketing communications, use the unsubscribe link in the email.',
        },
      ],
    },
    {
      id: 'children',
      title: '7. Children\'s Privacy',
      content:
        'The App is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we discover that a child under 13 has provided us with personal information, we will promptly delete it. Parents or guardians who believe their child has provided us with information should contact us immediately.',
    },
    {
      id: 'international',
      title: '8. International Data Transfers',
      content:
        'Your information may be stored and processed in the United States or other countries where Sierro or its service providers operate. By using the App, you consent to such transfers, which will be conducted in compliance with applicable data protection laws.',
    },
    {
      id: 'california',
      title: '9. California Privacy Rights',
      content:
        'If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information we collect, the right to request deletion, and the right to opt out of the sale of personal information (we do not sell personal information). To exercise these rights, contact us at support@sierro.com.',
    },
    {
      id: 'updates',
      title: '10. Changes to This Policy',
      content:
        'We may update this Privacy Policy from time to time. Material changes will be communicated through the App or via email notification. The "Last Updated" date at the top of this page indicates when the policy was last revised. Continued use of the App after changes constitutes acceptance of the updated policy.',
    },
    {
      id: 'contact',
      title: '11. Contact Us',
      content:
        'If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:\n\nSierro Inc.\nEmail: support@sierro.com\nMailing Address: San Francisco, California\n\nResponse time: Within 15 business days.\n\nYou may also lodge a complaint with your local data protection authority.',
    },
  ]

  return (
    <div className="min-h-screen bg-ink-13 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 safe-area-top border-b border-[rgba(255,255,255,0.06)]">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-ink-10 flex items-center justify-center text-ink-1 active:scale-95 transition-transform"
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-l bg-[rgba(1,214,190,0.1)] flex items-center justify-center">
            <Icon name="privacy" size={16} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink-1">Privacy Policy</h1>
            <p className="text-[11px] text-ink-6">Last updated: May 2026</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Intro */}
          <p className="text-body-md text-ink-6 leading-relaxed mb-6">
            This Privacy Policy describes how Sierro collects, uses, and protects your personal
            information when you use the Sierro App. We are committed to transparency and giving
            you control over your data.
          </p>

          {/* Table of Contents */}
          <div className="bg-ink-10 border border-[rgba(255,255,255,0.06)] rounded-l p-4 mb-6">
            <h2 className="text-[12px] font-bold text-ink-6 uppercase tracking-wider mb-3">Contents</h2>
            <div className="space-y-1">
              {sections.map(s => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-[12px] text-primary py-1 hover:text-[#14B8A6] transition-colors"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {sections.map((section, i) => (
              <motion.div
                key={section.id}
                id={section.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="bg-ink-10 border border-[rgba(1,214,190,0.08)] rounded-l p-4"
              >
                <h3 className="text-body-md font-bold text-primary mb-2">{section.title}</h3>
                <p className="text-[12px] text-ink-6 leading-relaxed whitespace-pre-line">
                  {section.content}
                </p>
                {section.subsections && (
                  <div className="mt-3 space-y-3">
                    {section.subsections.map(sub => (
                      <div
                        key={sub.title}
                        className="bg-[rgba(255,255,255,0.02)] rounded-l p-3 border border-[rgba(255,255,255,0.04)]"
                      >
                        <h4 className="text-[12px] font-semibold text-ink-1 mb-1">
                          {sub.title}
                        </h4>
                        <p className="text-[11px] text-ink-6 leading-relaxed">
                          {sub.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Footer */}
          <div className="text-center pt-8 pb-4 text-[11px] text-ink-7">
            &copy; 2026 Sierro Inc. All rights reserved.
          </div>
        </motion.div>
      </div>
    </div>
  )
}
