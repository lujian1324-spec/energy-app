/**
 * EmailJS configuration for the in-app Feedback / Support form.
 *
 * Fill in the three values below from your EmailJS dashboard
 * (https://dashboard.emailjs.com/). The feedback form will not send until
 * all three are replaced (the code falls back to a mailto: link otherwise).
 *
 * Recipient: the destination address (lujian1324@gmail.com) must be set as
 * the "To" field inside the EmailJS template itself — it is NOT sent from the
 * client. The template should reference these params: {{from_email}}, {{message}}.
 */
export const EMAILJS_SERVICE_ID = 'YOUR_EMAILJS_SERVICE_ID'
export const EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID'
export const EMAILJS_PUBLIC_KEY = 'YOUR_EMAILJS_PUBLIC_KEY'

/** Whether all EmailJS credentials have been configured. */
export const isEmailJsConfigured = (): boolean =>
  !EMAILJS_SERVICE_ID.startsWith('YOUR_') &&
  !EMAILJS_TEMPLATE_ID.startsWith('YOUR_') &&
  !EMAILJS_PUBLIC_KEY.startsWith('YOUR_')
