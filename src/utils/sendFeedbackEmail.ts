import {
  EMAILJS_SERVICE_ID,
  EMAILJS_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY,
  FEEDBACK_TO_EMAIL,
} from '../config/emailjs'

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send'

/**
 * EmailJS refuses requests that do not come from a browser — it reads the
 * `Origin` header to decide. `capacitor.config.ts` enables `CapacitorHttp`,
 * which replaces `window.fetch` with a bridge to the native HTTP stack, and a
 * native request carries no browser origin. The `@emailjs/browser` SDK sends
 * over `fetch`, so on iOS and Android its calls arrive looking non-browser and
 * are rejected, while the same code works on the web.
 *
 * Capacitor keeps the untouched implementation on `window.CapacitorWebFetch`
 * when it patches, so use that where it exists. Everywhere else this is the
 * ordinary `fetch`.
 */
function browserFetch(): typeof fetch {
  const patched = (globalThis as { CapacitorWebFetch?: typeof fetch }).CapacitorWebFetch
  return patched ?? fetch
}

/** Posts the feedback form. Throws with the service's own message on failure. */
export async function sendFeedbackEmail(params: {
  fromEmail: string
  message: string
}): Promise<void> {
  const res = await browserFetch()(EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        name: params.fromEmail || 'Sierro App User',
        from_email: params.fromEmail,
        message: params.message,
        subject: 'Sierro App Feedback',
        to_email: FEEDBACK_TO_EMAIL,
      },
    }),
  })

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).trim()
    throw new Error(detail || `Couldn't send feedback (${res.status}). Please try again.`)
  }
}
