import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

const LAST_UPDATED = '{{LAST_UPDATED_DATE}}';

const PRIVACY_SECTIONS = [
  { id: 'overview', title: '1. Privacy Overview' },
  { id: 'general-information', title: '2. General Information' },
  { id: 'information-you-provide', title: '3. Information You Provide' },
  { id: 'information-collected-automatically', title: '4. Information Collected Automatically' },
  { id: 'information-from-other-sources', title: '5. Information from Other Sources' },
  { id: 'cookies', title: '6. Cookies' },
  { id: 'uses-of-information', title: '7. Uses of Information' },
  { id: 'disclosure', title: '8. Disclosure of Information' },
  { id: 'cross-border', title: '9. Data Processing Outside Your Country' },
  { id: 'security', title: '10. Security of Your Data' },
  { id: 'your-rights', title: '11. Your Rights' },
  { id: 'policy-changes', title: '12. Changes to This Policy' },
  { id: 'contact', title: '13. Contact' }
] as const;

export default function PrivacyPage() {
  const sectionClassName =
    'rounded-lg border border-border/70 bg-muted/20 p-4 transition-[border-color,background-color,box-shadow] duration-200 hover:border-border/90 hover:bg-muted/30 hover:shadow-xs scroll-mt-24';

  return (
    <div className="container mx-auto px-4 py-10 md:py-12">
      <Card className="mx-auto max-w-5xl animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        <CardHeader>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
            LEGAL
          </p>
          <CardTitle className="text-3xl">Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="inline-flex rounded-full border border-border/70 bg-muted/25 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            This is starter template content rephrased from a public privacy policy structure and
            must be reviewed and approved by legal counsel before production use.
          </p>
          <p className="text-sm text-muted-foreground">
            Quick links:{' '}
            <Link
              href="/terms"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Terms of Service
            </Link>{' '}
            ·{' '}
            <Link
              href="/invitations/accept"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Accept Invitation
            </Link>{' '}
            ·{' '}
            <Link
              href="/register"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Register
            </Link>{' '}
            ·{' '}
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Login
            </Link>
          </p>

          <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="h-fit rounded-lg border border-border/70 bg-muted/20 p-4 lg:sticky lg:top-20">
              <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground">
                ON THIS PAGE
              </p>
              <ul className="space-y-2 text-sm">
                {PRIVACY_SECTIONS.map((section) => (
                  <li key={section.id}>
                    <Link
                      href={`#${section.id}`}
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {section.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="space-y-4">
              <section id="overview" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">1. Privacy Overview</h2>
                <p>
                  When you use {'{{PLATFORM_NAME}}'}, you entrust information to us. This Privacy
                  Policy explains how {'{{COMPANY_NAME}}'} collects, uses, shares, stores, and
                  protects personal information under applicable privacy and data protection laws.
                </p>
              </section>

              <section id="general-information" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">2. General Information</h2>
                <p>
                  This policy applies to {'{{PLATFORM_NAME}}'} at {'{{PLATFORM_URL}}'} and related
                  services. By using the platform, you acknowledge this policy and agree to the data
                  handling practices described here and in related legal documents.
                </p>
              </section>

              <section id="information-you-provide" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">3. Information You Provide</h2>
                <p className="mb-2">
                  We may collect information you submit through forms, account registration, support
                  channels, and product interactions, including:
                </p>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Name, job details, company/organization details, and contact information.</li>
                  <li>Email address, phone number, address, and account credentials metadata.</li>
                  <li>Billing or payment-related details where applicable.</li>
                  <li>Messages, comments, uploads, and other content you choose to submit.</li>
                </ul>
              </section>

              <section id="information-collected-automatically" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">
                  4. Information Collected Automatically
                </h2>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>
                    Technical data: IP address, browser type/version, OS, device type, and login
                    metadata.
                  </li>
                  <li>
                    Usage data: visited pages, clickstream paths, timestamps, errors, and
                    interaction events.
                  </li>
                  <li>
                    Performance data: response times, diagnostics, and service reliability metrics.
                  </li>
                </ul>
              </section>

              <section id="information-from-other-sources" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">5. Information from Other Sources</h2>
                <p>
                  We may receive relevant data from affiliates, partners, subcontractors, payment
                  providers, analytics services, ad networks, search providers, and other integrated
                  vendors to support service delivery and compliance.
                </p>
              </section>

              <section id="cookies" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">6. Cookies</h2>
                <p className="mb-2">
                  We use cookies and similar technologies to support security, functionality,
                  analytics, and product improvements.
                </p>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>
                    <strong>Strictly necessary cookies</strong> for core authentication and secure
                    product operation.
                  </li>
                  <li>
                    <strong>Analytical/performance cookies</strong> to understand service usage and
                    improve experience.
                  </li>
                  <li>
                    <strong>Functionality cookies</strong> to remember preferences and personalize
                    use.
                  </li>
                  <li>
                    <strong>Targeting cookies</strong> for relevant messaging where legally allowed.
                  </li>
                </ul>
                <p className="mt-2">
                  You can control cookies in your browser settings. Placeholder:{' '}
                  {'{{COOKIE_RETENTION_OR_EXPIRY_RULE}}'}.
                </p>
              </section>

              <section id="uses-of-information" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">7. Uses of Information</h2>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Provide, administer, and improve platform services.</li>
                  <li>Support onboarding, matching, workflow automation, and user support.</li>
                  <li>Run research, testing, and product development initiatives.</li>
                  <li>Detect misuse, enforce policies, and protect platform integrity.</li>
                  <li>Send service notices, updates, and relevant communications.</li>
                  <li>Maintain performance, reliability, and system security.</li>
                </ul>
              </section>

              <section id="disclosure" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">8. Disclosure of Information</h2>
                <p className="mb-2">We may disclose personal data to selected third parties:</p>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>To comply with legal obligations or lawful authority requests.</li>
                  <li>To enforce contracts, terms, and platform policies.</li>
                  <li>To processors and vendors supporting our services and operations.</li>
                  <li>For lawful research and development purposes with appropriate safeguards.</li>
                  <li>
                    During mergers, acquisitions, reorganizations, or asset transfers, as legally
                    permitted.
                  </li>
                </ul>
              </section>

              <section id="cross-border" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">
                  9. Data Processing Outside Your Country
                </h2>
                <p>
                  By using the platform, you acknowledge that data may be processed in
                  {' {{PRIMARY_HOSTING_COUNTRY}} '} and other jurisdictions where we or our
                  providers operate. We apply reasonable measures to protect transferred data in
                  line with applicable law.
                </p>
              </section>

              <section id="security" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">10. Security of Your Data</h2>
                <p>
                  We use technical and organizational safeguards to protect data from unauthorized
                  access, alteration, disclosure, or destruction. However, no internet transmission
                  or storage method can be guaranteed as completely secure.
                </p>
              </section>

              <section id="your-rights" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">11. Your Rights</h2>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Request access to personal data we hold about you.</li>
                  <li>Request correction, deletion, or restriction where applicable.</li>
                  <li>Object to direct marketing or specific processing activities.</li>
                  <li>Review third-party privacy notices when leaving our platform.</li>
                </ul>
              </section>

              <section id="policy-changes" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">12. Changes to This Policy</h2>
                <p>
                  We may update this Privacy Policy from time to time. Updates will be posted on
                  this page, and where required by law we will provide additional notice through
                  appropriate channels.
                </p>
              </section>

              <section id="contact" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">13. Contact</h2>
                <p>
                  Questions, comments, and requests about this Privacy Policy should be sent to
                  {' {{PRIVACY_CONTACT_EMAIL}} '} or {'{{PRIVACY_CONTACT_CHANNEL}}'}.
                </p>
              </section>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
