import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | open-autoDM',
  description: 'Privacy Policy and data processing practices for the open-autoDM automation platform.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How open-autoDM processes, protects, and retains your data when connecting Instagram accounts and automating direct messages."
      lastUpdated="October 23, 2026"
      activePath="/privacy-policy"
    >
      {/* Overview */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">1. Overview &amp; Scope</h2>
        <p>
          open-autoDM is a self-hosted, open-source automation application designed to help creators and businesses
          manage and automate Instagram comment replies, story reply acknowledgments, and direct messages via the
          official Meta Instagram Graph API.
        </p>
        <p>
          This Privacy Policy explains how data is collected, processed, secured, and retained by this deployment
          instance of open-autoDM. It applies to:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Instance Operators:</strong> Authenticated administrators who log into
            the open-autoDM console and connect Instagram Professional or Creator accounts.
          </li>
          <li>
            <strong className="text-foreground">Audience Members:</strong> Instagram users who publicly comment on
            posts or Reels, reply to stories, or send direct messages to an Instagram account managed through this
            system.
          </li>
        </ul>
      </section>

      {/* Information Collected */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">2. Information We Collect &amp; Process</h2>
        <p>
          The application only collects and processes data strictly necessary to execute user-configured automations
          and comply with Instagram platform rules:
        </p>

        <div className="space-y-4 pt-2">
          <div className="p-4 rounded-lg bg-muted/40 border border-border">
            <h3 className="font-semibold text-foreground text-[15px] mb-1">A. Operator Account Data</h3>
            <p className="text-muted-foreground text-[13.5px]">
              Instance operators authenticate via Supabase Auth using email and password. Public self-registration is
              disabled; operator accounts are provisioned exclusively by the instance owner.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/40 border border-border">
            <h3 className="font-semibold text-foreground text-[15px] mb-1">B. Connected Instagram Account Metadata</h3>
            <p className="text-muted-foreground text-[13.5px]">
              When an operator connects an Instagram Professional or Creator account via Meta OAuth (Instagram Login for
              Tech Providers), open-autoDM stores the account identifier (Instagram Scoped User ID / IGSID), username,
              display name, and profile picture URL. Long-lived access tokens received from Meta are encrypted at rest
              using AES-256-GCM before database insertion.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/40 border border-border">
            <h3 className="font-semibold text-foreground text-[15px] mb-1">C. Instagram Interaction &amp; Webhook Events</h3>
            <p className="text-muted-foreground text-[13.5px]">
              When subscribed webhooks deliver real-time events from Meta, open-autoDM processes:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground text-[13.5px]">
              <li>
                <strong>Post &amp; Reel Comments:</strong> Comment ID, comment text, creation timestamp, media ID, and the
                commenter&apos;s Instagram-scoped identifier (and username if supplied by the webhook payload).
              </li>
              <li>
                <strong>Direct Messages &amp; Story Replies:</strong> Message ID (<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">mid</code>),
                message text, sender and recipient IGSIDs, quick-reply payloads, and interaction timestamps.
              </li>
              <li>
                <strong>Live Broadcasts:</strong> Comment automation on active Instagram Live broadcasts is disabled in
                this deployment to strictly respect Meta messaging-window rules.
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-muted/40 border border-border">
            <h3 className="font-semibold text-foreground text-[15px] mb-1">D. Delivery Logs &amp; Idempotency Records</h3>
            <p className="text-muted-foreground text-[13.5px]">
              To prevent duplicate messages and enforce rate limits, the system records sent message logs (
              <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">dm_sent_log</code>) and atomic private reply
              reservations (<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">comment_private_reply_reservation</code>
              ) linking automation IDs, trigger event IDs, recipient IGSIDs, and delivery timestamps.
            </p>
          </div>
        </div>
      </section>

      {/* Purpose of Processing */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">3. Purpose of Processing</h2>
        <p>Data processed by open-autoDM is used strictly for the following purposes:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong>Automation Execution:</strong> Evaluating incoming comment or DM text against operator-configured
            keyword triggers and dispatching appropriate responses, public comment replies, or private DM replies.
          </li>
          <li>
            <strong>Webhook Security:</strong> Verifying incoming Meta payload signatures via HMAC-SHA256 with the
            configured Meta App Secret to prevent spoofing or unauthorized message injection.
          </li>
          <li>
            <strong>Platform Rule Enforcement:</strong> Upholding Meta messaging policies, including:
            <ul className="list-circle pl-5 mt-1 space-y-1 text-[13.5px]">
              <li>The 7-day comment private reply window.</li>
              <li>The strict one-private-reply-per-comment restriction via atomic database reservations.</li>
              <li>The standard 24-hour messaging window for follow-up conversational messages.</li>
              <li>Rolling-window rate limits and automated circuit breakers to protect accounts from abuse.</li>
            </ul>
          </li>
        </ul>
      </section>

      {/* Infrastructure & Security */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">4. Storage, Infrastructure &amp; Security</h2>
        <p>
          This deployment utilizes modern cloud infrastructure and encryption standards to protect data:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Database &amp; Storage (Supabase):</strong> Data is stored in a hosted
            PostgreSQL database with Row Level Security (RLS) enabled on all application tables. Direct mutations and
            reservations are locked down to trusted server-side execution roles.
          </li>
          <li>
            <strong className="text-foreground">Edge Compute (Cloudflare Workers):</strong> Application endpoints,
            cron-driven queue workers, and webhook handlers run within isolated V8 isolates on Cloudflare Workers.
          </li>
          <li>
            <strong className="text-foreground">Cryptographic Safeguards:</strong> Instagram access tokens and sensitive
            settings are encrypted at rest using AES-256-GCM. Secret comparisons and webhook HMAC verifications employ
            constant-time comparison algorithms to mitigate timing attacks.
          </li>
        </ul>
      </section>

      {/* Third-Party Service Providers */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">5. Third-Party Service Providers</h2>
        <p>
          To deliver its services, this open-autoDM deployment interacts with the following confirmed service
          providers:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Meta Platforms, Inc.:</strong> Provides the Instagram Graph API and
            webhook infrastructure required to authenticate accounts and send and receive Instagram messages.
          </li>
          <li>
            <strong className="text-foreground">Supabase, Inc.:</strong> Provides database infrastructure, user
            authentication, and secure file storage for automation media assets.
          </li>
          <li>
            <strong className="text-foreground">Cloudflare, Inc.:</strong> Provides serverless compute, global CDN
            distribution, scheduled trigger workers, and optional ephemeral AI inference (Cloudflare Workers AI)
            for drafting message variations and generating automated contextual responses when enabled by the account owner.
            Interaction text processed via Workers AI is evaluated in real time within Cloudflare&apos;s isolated infrastructure
            and is never retained or used to train foundation models.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1">
          No personal data or interaction contents are sold, leased, or shared with advertising networks or third-party
          AI model training services.
        </p>
      </section>

      {/* Retention & Deletion */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">6. Data Retention &amp; Deletion</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong>Transient Queue Jobs:</strong> Jobs in the <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">job_queue</code>
            table are removed after execution or marked failed after exhausting maximum configured attempts.
          </li>
          <li>
            <strong>Account Disconnection:</strong> When an operator disconnects an Instagram account from Settings,
            database foreign keys (<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">ON DELETE CASCADE</code>) immediately
            and permanently purge the account record, encrypted access tokens, associated automations, and delivery logs.
          </li>
          <li>
            <strong>Data Deletion Requests:</strong> For detailed instructions on removing connected accounts or
            requesting manual data deletion, see our dedicated{' '}
            <Link href="/data-deletion" className="text-primary underline underline-offset-2 hover:text-foreground">
              Data Deletion Instructions
            </Link>
            .
          </li>
        </ul>
      </section>

      {/* Contact Information */}
      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-xl font-heading font-bold text-foreground">7. Contact the Operator</h2>
        <p>
          If you have questions regarding this Privacy Policy, wish to exercise your data protection rights, or need to
          request manual removal of your information, please contact the instance administrator:
        </p>
        <div className="p-4 rounded-lg bg-muted/30 border border-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-semibold text-foreground text-[14px]">open-autoDM Administration</p>
            <p className="text-xs text-muted-foreground">Privacy &amp; Data Rights Inquiries</p>
          </div>
          <a
            href="mailto:work.techhacksai@gmail.com"
            className="text-sm font-mono text-primary hover:underline hover:text-foreground transition-colors"
          >
            work.techhacksai@gmail.com
          </a>
        </div>
      </section>
    </LegalLayout>
  );
}
