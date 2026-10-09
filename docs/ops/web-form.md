# Public website inquiry form

AuditSphere accepts public inquiries at `POST https://YOUR_WORKER_ORIGIN/api/public/leads`. The Worker validates the request, verifies the Turnstile response, limits five submissions per hashed IP in a rolling hour, and stores accepted inquiries for staff triage. It does not host a marketing page.

## Configure before embedding

1. Create a Cloudflare Turnstile widget for the marketing-site hostname. Put its public site key in the page and the matching secret in the Worker secret `TURNSTILE_SECRET_KEY`. Set `PUBLIC_LEAD_TURNSTILE_HOSTNAMES` to the exact expected hostname or comma-separated hostname list; Siteverify must return one of these hostnames before an inquiry is accepted.
2. Set `PUBLIC_LEAD_ALLOWED_ORIGINS` to the exact origin or comma-separated origins allowed to submit the form, for example `https://www.example.com,https://example.com`. Include scheme and port where applicable; do not add paths or trailing slashes.
3. Set `PUBLIC_LEAD_IP_HASH_SECRET` to a randomly generated secret with at least 32 characters. The D1 hourly limiter and stored keyed IP digest fail closed without it. Rotate it only with awareness that the active rate-limit window is keyed by the prior value.
4. Set `PUBLIC_LEAD_DEFAULT_COUNTRY_CODE` to the firm's two-letter jurisdiction. It is applied when staff accept an inquiry and create a prospect.
5. If more than one active BUSINESS workspace exists, set `PUBLIC_LEAD_WORKSPACE_ID` to the workspace that owns web inquiries. Without it, intake requires exactly one active BUSINESS workspace.
6. To send a staff notification for non-spam submissions, set `PUBLIC_LEAD_NOTIFICATION_EMAIL` to the authorized firm inbox. The Worker queues notifications through the configured `EMAIL_PROVIDER` outbox. Leave it unset to keep notifications off.

For the AuditSphere website inquiry integration, the configured marketing origin and expected Turnstile hostname are `https://www.steaudit.com` and `www.steaudit.com`; notifications are addressed to the Microsoft 365 mailbox `audit@steaudit.com`. Keep the `steaudit.com` apex MX on Microsoft 365. Cloudflare Email Routing on the apex would divert the domain's inbound mail away from M365; Cloudflare Email Sending and its bounce records do not require that MX change.

The public lead endpoint must pass the production readiness checks for Turnstile, the IP hashing secret, the default country, and the shared email/rate-limit dependencies before production is considered ready. Never put the Turnstile secret, email credentials, or IP-hash secret in page markup.

## Embed example

Replace `YOUR_WORKER_ORIGIN` and `YOUR_TURNSTILE_SITE_KEY`. The browser sends only the form data to the Worker. The site key is public; the verification secret remains a Worker secret.

```html
<form id="audit-inquiry-form">
  <label>Company name <input name="companyName" maxlength="200" required></label>
  <label>Contact name <input name="contactName" maxlength="200" autocomplete="name" required></label>
  <label>Email <input name="email" type="email" maxlength="320" autocomplete="email" required></label>
  <label>Phone <input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>
  <label>Service of interest
    <select name="serviceInterest">
      <option value="">Not sure yet</option>
      <option value="STATUTORY_AUDIT">Statutory audit</option>
      <option value="INTERNAL_AUDIT">Internal audit</option>
      <option value="AGREED_UPON_PROCEDURES">Agreed-upon procedures</option>
      <option value="OTHER">Other</option>
    </select>
  </label>
  <label>How can we help? <textarea name="message" maxlength="4000"></textarea></label>
  <div class="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY"></div>
  <div class="inquiry-honeypot" aria-hidden="true">
    <label>Leave this field empty <input name="website" tabindex="-1" autocomplete="off"></label>
  </div>
  <button type="submit">Send inquiry</button>
  <p id="audit-inquiry-status" role="status" aria-live="polite"></p>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  .inquiry-honeypot { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
</style>
<script>
  document.getElementById('audit-inquiry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const status = document.getElementById('audit-inquiry-status');
    const button = form.querySelector('button[type="submit"]');
    const turnstileToken = values.get('cf-turnstile-response');
    if (!turnstileToken) {
      status.textContent = 'Complete the verification challenge and try again.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Sending your inquiry…';
    try {
      const response = await fetch('https://YOUR_WORKER_ORIGIN/api/public/leads', {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: values.get('companyName'),
          contactName: values.get('contactName'),
          email: values.get('email'),
          phone: values.get('phone'),
          serviceInterest: values.get('serviceInterest') || undefined,
          message: values.get('message'),
          website: values.get('website'),
          turnstileToken
        })
      });
      if (!response.ok) throw new Error('The service did not accept this inquiry.');
      status.textContent = 'Thank you. Your inquiry was received.';
      form.reset();
      if (window.turnstile) window.turnstile.reset();
    } catch {
      status.textContent = 'We could not send your inquiry. Please retry later or contact the firm directly.';
    } finally {
      button.disabled = false;
    }
  });
</script>
```

Add the firm's privacy notice next to the form before collecting contact details. Do not add secret keys, internal record IDs, or fields for sensitive audit evidence to this public form. `202` returns only `{ "accepted": true }`, including for a filled honeypot; it does not echo submitted values. A `403` usually means the page origin is missing from `PUBLIC_LEAD_ALLOWED_ORIGINS`; `422` means validation or Turnstile failed; `429` means the hourly limit was reached.

## Staff triage

Staff with `lead.read` can view the Web inquiries queue and filter by status. Staff with `lead.manage` can accept a submission into a `WEB_FORM` lead, mark it spam, or close it as a duplicate. Acceptance requires the service and audited period; the original receipt time is preserved. An optional duplicate lead must be for the same contact email. Each triage uses the submission's version so stale screens cannot overwrite newer decisions.
