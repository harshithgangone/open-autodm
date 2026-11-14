import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | open-autoDM',
  description: 'Terms of Service and usage conditions for the open-autoDM automation platform.',
};

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="Usage conditions, compliance guidelines, and service boundaries for operating open-autoDM."
      lastUpdated="October 23, 2026"
      activePath="/terms"
    >
      {/* Acceptance */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">1. Acceptance of Terms</h2>
        <p>
          By accessing or operating this open-autoDM instance, connecting an Instagram Professional or Creator account,
          or setting up automated replies, you agree to be bound by these Terms of Service. If you do not agree to these
          terms, you must not use or connect accounts to this application.
        </p>
      </section>

      {/* Permitted Use & Meta Compliance */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">2. Permitted Use &amp; Platform Compliance</h2>
        <p>
          open-autoDM is provided to facilitate legitimate, creator-to-audience communication on Instagram through
          automated comment responses and direct messaging.
        </p>
        <p>As a condition of using this service, you agree that:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Meta Platform Rules:</strong> You will comply at all times with{' '}
            <a
              href="https://developers.facebook.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-foreground"
            >
              Meta Platform Terms
            </a>
            , the{' '}
            <a
              href="https://help.instagram.com/581066165581870"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-foreground"
            >
              Instagram Community Guidelines
            </a>
            , and all applicable developer policies.
          </li>
          <li>
            <strong className="text-foreground">No Spam or Harassment:</strong> You will not use open-autoDM to send
            unsolicited bulk spam, deceptive promotions, harassment, malicious links, or repetitive mass direct
            messages.
          </li>
          <li>
            <strong className="text-foreground">Honoring User Intent:</strong> If an Instagram user requests to stop
            receiving automated direct messages or disconnects from your community, you must respect their request and
            desist from automated outreach.
          </li>
        </ul>
      </section>

      {/* Account Authorization */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">3. Account Ownership &amp; Authorization</h2>
        <p>
          You represent and warrant that you are the verified owner of, or have explicit legal authorization to manage,
          any Instagram Professional or Creator account connected to this instance.
        </p>
        <p className="text-muted-foreground">
          You are solely responsible for maintaining the confidentiality of your login credentials, environment
          variables, and access tokens. You accept full responsibility for all activities, messages, and content
          dispatched through your connected Instagram accounts.
        </p>
      </section>

      {/* Platform & API Limitations */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">4. Third-Party Platform Dependencies &amp; Limitations</h2>
        <p>
          open-autoDM relies on external application programming interfaces (APIs) provided by Meta Platforms, Inc.
          (Instagram Graph API), Supabase, and Cloudflare. You acknowledge and accept that:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong>API Availability &amp; Changes:</strong> Meta may modify rate limits, adjust API endpoints, alter
            messaging windows, or revoke permissions at its discretion without prior notice.
          </li>
          <li>
            <strong>Built-In Safeguards:</strong> While open-autoDM implements rate limiters, circuit breakers, 7-day
            comment reply windows, and duplicate send prevention, the software cannot prevent account penalties or
            throttling imposed directly by Meta if your automation content violates platform policies.
          </li>
          <li>
            <strong>No Guarantee of Delivery:</strong> System delays, network blips, or upstream platform downtime may
            occasionally prevent or delay automated message delivery.
          </li>
        </ul>
      </section>

      {/* Disconnection & Termination */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">5. Disconnection &amp; Termination</h2>
        <p>
          You may terminate service for any connected Instagram account at any time by navigating to{' '}
          <strong className="text-foreground">Settings → Connected Accounts → Disconnect</strong>.
        </p>
        <p className="text-muted-foreground">
          The instance operator reserves the right to suspend or revoke access to the instance, pause automations, or
          remove connected accounts immediately and without liability if an account is found to be in violation of
          these Terms, generating policy flags, or compromising system stability.
        </p>
      </section>

      {/* Disclaimer of Warranties */}
      <section className="space-y-3">
        <h2 className="text-xl font-heading font-bold text-foreground">6. Disclaimer of Warranties</h2>
        <div className="p-4 rounded-lg bg-muted/40 border border-border text-[13.5px] leading-relaxed text-muted-foreground font-mono">
          THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
          NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO
          EVENT SHALL THE AUTHORS, OPERATORS, OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, LOSS OF DATA,
          ACCOUNT RESTRICTIONS, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM,
          OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
        </div>
      </section>

      {/* Contact */}
      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-xl font-heading font-bold text-foreground">7. Questions &amp; Support</h2>
        <p>
          For inquiries regarding these Terms of Service or to report misuse of an automation operating through this
          system, please reach out to the instance administrator:
        </p>
        <div className="p-4 rounded-lg bg-muted/30 border border-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-semibold text-foreground text-[14px]">open-autoDM Administration</p>
            <p className="text-xs text-muted-foreground">Terms &amp; Operational Inquiries</p>
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
