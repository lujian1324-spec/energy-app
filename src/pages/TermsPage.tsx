import { motion } from 'framer-motion'
import Icon from '../components/Icon'
import { useNavigate } from 'react-router-dom'

interface Section {
  id: string
  title: string
  content: string
}

export default function TermsPage() {
  const navigate = useNavigate()

  const sections: Section[] = [
    {
      id: 'acceptance',
      title: '1. Acceptance of Terms',
      content:
        'By downloading, installing, or using the Sierro App ("the App"), you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the App. Sierro Inc. ("Sierro," "we," "us," or "our") reserves the right to update these terms at any time. Continued use of the App after changes constitutes acceptance of the modified terms.',
    },
    {
      id: 'eligibility',
      title: '2. Eligibility',
      content:
        'You must be at least 13 years of age to use the App. By using the App, you represent and warrant that you meet this age requirement. If you are under 18, you represent that you have obtained parental or legal guardian consent to use the App.',
    },
    {
      id: 'account',
      title: '3. Account Registration',
      content:
        'To access certain features, you must create an account. You agree to provide accurate and complete information during registration and to keep your account credentials secure. You are responsible for all activity under your account. Notify us immediately of any unauthorized use.',
    },
    {
      id: 'license',
      title: '4. License Grant',
      content:
        'Subject to these Terms, Sierro grants you a limited, non-exclusive, non-transferable, revocable license to use the App for your personal, non-commercial purposes. You may not copy, modify, distribute, sell, or lease any part of the App, nor reverse engineer or attempt to extract the source code.',
    },
    {
      id: 'device-usage',
      title: '5. Device Usage & Safety',
      content:
        'The App interfaces with Sierro portable power stations. You agree to operate connected devices in accordance with all applicable safety guidelines and manufacturer specifications. Sierro is not liable for damage to connected devices resulting from overloading, improper use, or failure to follow published specifications. Always verify power requirements before connecting any device.',
    },
    {
      id: 'prohibited',
      title: '6. Prohibited Activities',
      content:
        'You agree not to: (a) use the App for any unlawful purpose; (b) interfere with or disrupt the App or its servers; (c) attempt to gain unauthorized access to other users\' accounts or Sierro systems; (d) upload malicious code or content; (e) use the App in connection with life-support systems or medical devices without explicit written authorization from Sierro; (f) resell or commercially exploit the App or its functionality.',
    },
    {
      id: 'intellectual-property',
      title: '7. Intellectual Property',
      content:
        'The App, including its design, text, graphics, logos, icons, and software, is the exclusive property of Sierro Inc. and is protected by copyright, trademark, and other intellectual property laws. The Sierro name and logo are trademarks of Sierro Inc. All rights not expressly granted are reserved.',
    },
    {
      id: 'third-party',
      title: '8. Third-Party Services',
      content:
        'The App may integrate with third-party services (e.g., Google Sign-In, cloud data storage). Sierro does not control these services and is not responsible for their availability, security, or data practices. Your use of third-party services is subject to their respective terms and policies.',
    },
    {
      id: 'disclaimer',
      title: '9. Disclaimer of Warranties',
      content:
        'THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. SIERRO DOES NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS. USE OF THE APP IS AT YOUR SOLE RISK.',
    },
    {
      id: 'limitation',
      title: '10. Limitation of Liability',
      content:
        'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, SIERRO AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF OR INABILITY TO USE THE APP, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL SIERRO\'S TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID FOR THE APP (IF ANY) IN THE TWELVE MONTHS PRECEDING THE CLAIM.',
    },
    {
      id: 'indemnification',
      title: '11. Indemnification',
      content:
        'You agree to indemnify, defend, and hold harmless Sierro and its affiliates from any claims, damages, liabilities, costs, or expenses (including reasonable attorneys\' fees) arising from your use of the App, your violation of these Terms, or your violation of any rights of a third party.',
    },
    {
      id: 'termination',
      title: '12. Termination',
      content:
        'Sierro may suspend or terminate your access to the App at any time, with or without cause, including for violation of these Terms. Upon termination, your license to use the App ceases immediately. You may terminate your account at any time through Settings > Delete Account.',
    },
    {
      id: 'governing-law',
      title: '13. Governing Law & Dispute Resolution',
      content:
        'These Terms shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law principles. Any dispute arising from these Terms shall be resolved through binding arbitration in San Francisco, California, unless otherwise required by applicable law. You waive any right to participate in a class action lawsuit or class-wide arbitration.',
    },
    {
      id: 'changes',
      title: '14. Changes to Terms',
      content:
        'We may revise these Terms from time to time. Material changes will be communicated through the App or via email. The "Last Updated" date at the top of this page indicates when the Terms were last revised. Your continued use of the App after the effective date of any changes constitutes acceptance of the updated Terms.',
    },
    {
      id: 'contact',
      title: '15. Contact Us',
      content:
        'If you have any questions about these Terms of Use, please contact us at:\n\nSierro Inc.\nEmail: support@sierro.com\nAddress: San Francisco, California\n\nResponse time: Within 15 business days.',
    },
  ]

  return (
    <div className="min-h-screen bg-ink-12 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 safe-area-top border-b border-[rgba(255,255,255,0.06)]">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-ink-10 flex items-center justify-center text-ink-1 active:scale-95 transition-transform"
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-l bg-[rgba(52,199,89,0.1)] flex items-center justify-center">
            <Icon name="term of use" size={16} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink-1">Terms of Use</h1>
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
            Welcome to Sierro. These Terms of Use govern your use of the Sierro App and its related
            services. Please read them carefully before using the App.
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
                className="bg-ink-10 border border-[rgba(52,199,89,0.08)] rounded-l p-4"
              >
                <h3 className="text-body-md font-bold text-success mb-2">{section.title}</h3>
                <p className="text-[12px] text-ink-6 leading-relaxed whitespace-pre-line">
                  {section.content}
                </p>
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
