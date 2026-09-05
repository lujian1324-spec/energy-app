/**
 * EmailJS configuration for the in-app Feedback / Support form.
 *
 * Fill in the three values below from your EmailJS dashboard
 * (https://dashboard.emailjs.com/). The feedback form will not send until
 * all three are replaced (the code falls back to a mailto: link otherwise).
 *
 * Recipient: FEEDBACK_TO_EMAIL (jason@Sierro.us). Prefer setting the EmailJS
 * template "To" field to this address (or {{to_email}}). The client also passes
 * to_email so templates that use the variable stay in sync. mailto: fallback
 * uses the same constant.
 */
export const FEEDBACK_TO_EMAIL = 'jason@Sierro.us'

export const EMAILJS_SERVICE_ID = 'service_doy82fa'
export const EMAILJS_TEMPLATE_ID = 'template_y2kxukg'
export const EMAILJS_PUBLIC_KEY = 'EYCUlzyOZ4nO8MVea'

/** Whether all EmailJS credentials have been configured. */
export const isEmailJsConfigured = (): boolean =>
  !EMAILJS_SERVICE_ID.startsWith('YOUR_') &&
  !EMAILJS_TEMPLATE_ID.startsWith('YOUR_') &&
  !EMAILJS_PUBLIC_KEY.startsWith('YOUR_')
