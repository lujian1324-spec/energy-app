/**
 * EmailJS configuration for the in-app Feedback / Support form.
 *
 * Fill in the three values below from your EmailJS dashboard
 * (https://dashboard.emailjs.com/). The feedback form will not send until
 * all three are replaced (the code falls back to a mailto: link otherwise).
 *
 * Recipient: FEEDBACK_TO_EMAIL (lujian1324@gmail.com) — also set as the EmailJS
 * template "To" field. Client passes to_email / name / from_email / message for
 * template variables; mailto: fallback uses the same recipient constant.
 *
 * Template Contact Us ID must stay in sync with the dashboard (template_3hwbswo).
 */
export const FEEDBACK_TO_EMAIL = 'lujian1324@gmail.com'

export const EMAILJS_SERVICE_ID = 'service_doy82fa'
export const EMAILJS_TEMPLATE_ID = 'template_3hwbswo'
export const EMAILJS_PUBLIC_KEY = 'EYCUlzyOZ4nO8MVea'

/** Whether all EmailJS credentials have been configured. */
export const isEmailJsConfigured = (): boolean =>
  !EMAILJS_SERVICE_ID.startsWith('YOUR_') &&
  !EMAILJS_TEMPLATE_ID.startsWith('YOUR_') &&
  !EMAILJS_PUBLIC_KEY.startsWith('YOUR_')
