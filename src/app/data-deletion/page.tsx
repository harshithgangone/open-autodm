import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';
import Link from 'next/link';
import { Trash2, AlertTriangle, CheckCircle, Mail } from 'lucide-react';
import { getDashboardLink } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Data Deletion Instructions | open-autoDM',
  description: 'Instructions on how to delete your connected account and interaction data from open-autoDM.',
};

interface DataDeletionPageProps {
  searchParams?: Promise<{ id?: string; confirmation_code?: string }>;
}

export default async function DataDeletionPage({ searchParams }: DataDeletionPageProps) {
  const dashboardLink = getDashboardLink();
  const params = searchParams ? await searchParams : {};
  const confirmationCode = params.id || params.confirmation_code;

  return (
    <LegalLayout
      title="User Data Deletion Instructions"
      subtitle="How to remove your Instagram account, revoke application access, and request complete deletion of stored interaction logs."
      lastUpdated="October 23, 2026"
      activePath="/data-deletion"
    >
      {/* Active Deletion Request Confirmation Banner */}
      {confirmationCode && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-foreground mb-6 space-y-2">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-base">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>Data Deletion Request Status: Completed</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Confirmation code:{' '}
            <code className="bg-background px-1.5 py-0.5 rounded font-mono text-foreground border border-border">
              {confirmationCode}
            </code>
          </p>
          <p className="text-sm text-muted-foreground">
            In accordance with our data retention policy, all connected account credentials, automations, and audience
            interaction records associated with this request have been permanently purged from our database.
          </p>
        </div>
      )}

      {/* Introduction */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">1. Commitment to Data Deletion</h2>
        <p>
          open-autoDM respects your control over your data. In compliance with the Meta Platform Terms and data privacy
          principles, this page outlines the procedures available to disconnect your account, revoke application
          permissions, and request the deletion of all associated interaction and account records.
        </p>
      </section>

      {/* Option 1: Self-Service Disconnection */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
            1
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">
            Self-Service Account Disconnection (Instance Operators)
          </h2>
        </div>
        <p>
          If you are an authenticated operator who connected an Instagram Professional or Creator account to this
          instance, you can delete your account connection and all associated data directly from the console:
        </p>

        <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
          <ol className="list-decimal pl-5 space-y-2 text-[14px] text-muted-foreground">
            <li>
              Log into the open-autoDM dashboard at{' '}
              <Link href={dashboardLink.href} className="text-primary hover:underline">
                {dashboardLink.label}
              </Link>
              .
            </li>
            <li>
              Navigate to the <strong className="text-foreground">Settings</strong> page from the sidebar.
            </li>
            <li>
              Under the <strong className="text-foreground">Connected Accounts</strong> section, find your Instagram
              handle and click the <strong className="text-foreground">Disconnect</strong> button.
            </li>
            <li>Confirm the prompt.</li>
          </ol>

          <div className="flex items-start gap-2.5 pt-2 text-[13px] text-foreground/90 bg-background/60 p-3 rounded-lg border border-border">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <strong>Immediate Deletion:</strong> Disconnecting an account triggers an immediate database foreign-key
              cascade (<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">ON DELETE CASCADE</code>) that
              permanently purges the connected account record, encrypted OAuth access tokens, all automation rules
              configured for that account, pending queue jobs, and outbound delivery logs.
            </div>
          </div>
        </div>
      </section>

      {/* Option 2: Revoking Meta Access */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
            2
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">
            Revoking Permissions from Inside Instagram / Facebook
          </h2>
        </div>
        <p>
          You can revoke open-autoDM&apos;s permissions directly from Meta&apos;s platform at any time, which invalidates all
          stored access tokens and prevents the application from receiving future webhooks:
        </p>

        <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2 text-[14px] text-muted-foreground">
          <p className="font-semibold text-foreground">Steps to remove access via the Instagram mobile app:</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Open the Instagram app and navigate to your Profile.</li>
            <li>Tap the menu icon (hamburger) and select <strong>Settings and activity</strong>.</li>
            <li>Select <strong>Website permissions</strong> (or <strong>Apps and websites</strong>).</li>
            <li>Under the <strong>Active</strong> tab, locate <strong>open-autoDM</strong>.</li>
            <li>Tap <strong>Remove</strong>.</li>
          </ol>
        </div>
      </section>

      {/* Option 3: Manual Deletion Request */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
            3
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">
            Manual Data Deletion Request (Audience &amp; Operators)
          </h2>
        </div>
        <p>
          If you are an audience member who interacted with an automated account (such as commenting or sending a DM)
          and wish to request the manual deletion of your user identifier and interaction logs, or if you are an
          operator requesting complete removal of your operator account, please submit a deletion request by email.
        </p>

        <div className="p-5 rounded-xl bg-muted/30 border border-border space-y-4 text-[14px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Contact Email</p>
              <a
                href="mailto:work.techhacksai@gmail.com"
                className="font-mono text-base font-semibold text-primary hover:underline"
              >
                work.techhacksai@gmail.com
              </a>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Email Subject</p>
              <code className="text-xs font-mono bg-background px-2 py-1 rounded border border-border">
                open-autoDM Data Deletion Request
              </code>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground mb-2">Required Information in Your Request:</p>
            <p className="text-muted-foreground mb-2 text-[13.5px]">
              To locate and verify the data corresponding to your request, please provide:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-[13.5px]">
              <li>
                <strong>Instagram Username or IGSID:</strong> Your public Instagram handle (e.g.{' '}
                <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">@yourusername</code>) or Instagram-Scoped
                User ID.
              </li>
              <li>
                <strong>Target Account:</strong> The Instagram username of the creator or brand account you interacted with.
              </li>
              <li>
                <strong>Operator Email (if applicable):</strong> If you are an instance operator requesting user account
                removal, the email address of your login account.
              </li>
              <li>
                <strong>Description of Data:</strong> Clarify whether you are requesting deletion of connected account
                tokens, comment delivery logs, or audience interaction records.
              </li>
            </ul>
          </div>

          {/* Security Alert */}
          <div className="flex items-start gap-3 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-foreground text-[13px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-600 dark:text-amber-400">Security Warning:</strong> Never send passwords,
              private encryption keys, or API secrets via email. We will never ask you for your Instagram or Supabase
              password.
            </div>
          </div>
        </div>
      </section>

      {/* Verification & Processing Timeline */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">4. Verification &amp; Processing Timelines</h2>
        <p className="text-muted-foreground">
          Because automated data deletion without verification poses a risk of unauthorized deletion or denial-of-service
          against third parties, all manual deletion requests are reviewed and verified:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong>Identity &amp; Ownership Verification:</strong> We will verify ownership of the account (for example,
            by asking for a direct confirmation message from the Instagram handle in question).
          </li>
          <li>
            <strong>Processing Timeline:</strong> Verified manual requests are processed directly in the database within{' '}
            <strong className="text-foreground">30 calendar days</strong> of verification.
          </li>
          <li>
            <strong>Confirmation:</strong> Once the deletion has been executed across all active database tables and
            storage objects, a confirmation email will be delivered to you.
          </li>
          <li>
            <strong>Legally Required Records:</strong> Transient rate-limiting records strictly required to prevent
            abuse or records required to comply with applicable legal obligations will be retained only as permitted by
            law.
          </li>
        </ul>
      </section>
    </LegalLayout>
  );
}
