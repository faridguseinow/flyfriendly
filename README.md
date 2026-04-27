# flyfriendly

## Claim confirmation email

The project now supports a transactional confirmation email after an eligible lead is submitted from the claim flow.

### How it works

- The frontend saves the lead in Supabase as before.
- After the final submit step, the client invokes the Supabase Edge Function `send-claim-confirmation`.
- The Edge Function reads the lead from Supabase, sends the email through Resend, and stores delivery metadata on the lead record to avoid duplicate sends.

### Required setup

1. Run the SQL migration:

```sql
-- supabase/sql/011_lead_confirmation_email.sql
```

2. Deploy the Edge Function:

```bash
supabase functions deploy send-claim-confirmation
```

3. Add function secrets in Supabase:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set SITE_URL=https://fly-friendly.com
supabase secrets set MAIL_FROM="Fly Friendly <info@fly-friendly.com>"
supabase secrets set MAIL_REPLY_TO=info@fly-friendly.com
```

4. Verify the `fly-friendly.com` domain in Resend and add the DNS records Resend provides.

### What is needed for `info@fly-friendly.com`

- A working mailbox for incoming replies. You already have this part if `info@fly-friendly.com` is active in your hosting mail panel.
- Domain verification in the email sending provider.
- SPF and DKIM records for outbound transactional mail.
- A sender address configured as `Fly Friendly <info@fly-friendly.com>`.

Important: the site should not send mail directly from the browser with SMTP credentials or API keys. Those secrets must stay in the Edge Function environment.
