/**
 * EmailJS configuration for the in-app Feedback / Support form.
 *
 * Fill in the three values below from your EmailJS dashboard
 * (https://dashboard.emailjs.com/). The feedback form will not send until
 * all three are replaced (the code falls back to a mailto: link otherwise).
 *
 * Recipients:
 * - FEEDBACK_TO_EMAIL (lujian1324@gmail.com) — primary To; also set as the
 *   EmailJS template "To" field (or {{to_email}}).
 * - FEEDBACK_BCC_EMAIL (info@sierro.us) — additional copy. For delivery, the
 *   EmailJS template must either hardcode BCC to info@sierro.us OR bind the
 *   BCC field to {{bcc_email}}. Code alone does not add BCC if the dashboard
 *   template ignores that variable.
 *
 * Client passes to_email / bcc_email / name / from_email / message.
 * mailto: fallback should use To=FEEDBACK_TO_EMAIL and cc=FEEDBACK_BCC_EMAIL.
 *
 * Template Contact Us ID must stay in sync with the dashboard (template_3hwbswo).
 */
export const FEEDBACK_TO_EMAIL = 'lujian1324@gmail.com'
/** Extra Feedback recipient (BCC). Keep FEEDBACK_TO_EMAIL as primary. */
export const FEEDBACK_BCC_EMAIL = 'info@sierro.us'

export const EMAILJS_SERVICE_ID = 'service_doy82fa'
export const EMAILJS_TEMPLATE_ID = 'template_3hwbswo'
export const EMAILJS_PUBLIC_KEY = 'EYCUlzyOZ4nO8MVea'

/** Whether all EmailJS credentials have been configured. */
export const isEmailJsConfigured = (): boolean =>
  !EMAILJS_SERVICE_ID.startsWith('YOUR_') &&
  !EMAILJS_TEMPLATE_ID.startsWith('YOUR_') &&
  !EMAILJS_PUBLIC_KEY.startsWith('YOUR_')
