import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

const LAST_UPDATED = '{{LAST_UPDATED_DATE}}';

const TERMS_SECTIONS = [
  { id: 'definitions', title: '1. Definitions' },
  { id: 'introduction-updates', title: '2. Introduction and Updates' },
  { id: 'platform-purpose', title: '3. Platform Purpose' },
  { id: 'access', title: '4. Access to the Platform' },
  { id: 'information-disclaimer', title: '5. Non-Reliance on Information' },
  { id: 'ip-rights', title: '6. Intellectual Property Rights' },
  { id: 'user-declarations', title: '7. User Declarations' },
  { id: 'usage-restrictions', title: '8. Usage Restrictions' },
  { id: 'liability', title: '9. Limits of Liability' },
  { id: 'no-warranty', title: '10. Waiver of Claims / No Warranty' },
  { id: 'indemnification', title: '11. Indemnification' },
  { id: 'suspension-termination', title: '12. Suspension and Termination' },
  { id: 'subscription', title: '13. Subscription Terms' },
  { id: 'payments', title: '14. Payment and Financial Transactions' },
  { id: 'virus-protection', title: '15. Virus Protection and Technical Risk' },
  { id: 'links', title: '16. Links To and From the Platform' },
  { id: 'severability', title: '17. Partial Invalidity (Severability)' },
  { id: 'governing-law', title: '18. Applicable Law and Jurisdiction' },
  { id: 'language', title: '19. Authorized Language' },
  { id: 'contact', title: '20. Contact Methods' }
] as const;

export default function TermsPage() {
  const sectionClassName =
    'rounded-lg border border-border/70 bg-muted/20 p-4 transition-[border-color,background-color,box-shadow] duration-200 hover:border-border/90 hover:bg-muted/30 hover:shadow-xs scroll-mt-24';

  return (
    <div className="container mx-auto px-4 py-10 md:py-12">
      <Card className="mx-auto max-w-5xl animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        <CardHeader>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
            LEGAL
          </p>
          <CardTitle className="text-3xl">Terms of Service</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="inline-flex rounded-full border border-border/70 bg-muted/25 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            This is starter template content rephrased from a public terms structure and must be
            reviewed and approved by legal counsel before production use.
          </p>
          <p className="text-sm text-muted-foreground">
            Quick links:{' '}
            <Link
              href="/privacy"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Privacy Policy
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
                {TERMS_SECTIONS.map((section) => (
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
              <section id="definitions" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">1. Definitions</h2>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>
                    <strong>{'{{PLATFORM_NAME}}'}</strong>: the platform available at{' '}
                    <strong>{'{{PLATFORM_URL}}'}</strong>.
                  </li>
                  <li>
                    <strong>{'{{COMPANY_NAME}}'}</strong>: the legal entity operating the platform.
                  </li>
                  <li>
                    <strong>{'{{SERVICE_PROVIDER_NAME}}'}</strong>: any authorized operational
                    partner, if applicable.
                  </li>
                  <li>
                    <strong>User</strong>: any visitor, account holder, or beneficiary of platform
                    services.
                  </li>
                </ul>
              </section>

              <section id="introduction-updates" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">2. Introduction and Updates</h2>
                <p>
                  These Terms, together with referenced policies and notices, govern platform use.
                  We may update them at any time, and updates become effective when published. Your
                  continued use indicates acceptance of the latest version.
                </p>
              </section>

              <section id="platform-purpose" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">3. Platform Purpose</h2>
                <p>
                  {'{{PLATFORM_NAME}}'} is designed to support recruitment and workforce workflows,
                  including AI-assisted capabilities where enabled. By using the platform, you agree
                  to use it for lawful and authorized purposes only.
                </p>
              </section>

              <section id="access" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">4. Access to the Platform</h2>
                <p>
                  We may limit access by geography, role, organization, subscription, or technical
                  requirements. Availability outside {'{{PRIMARY_OPERATING_REGION}}'} is not
                  guaranteed. We may suspend, withdraw, or change platform features with or without
                  notice.
                </p>
              </section>

              <section id="information-disclaimer" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">5. Non-Reliance on Information</h2>
                <p>
                  We work to keep information current and accurate, but do not guarantee
                  completeness, accuracy, fitness, or ongoing availability. You should obtain
                  professional advice before relying on platform content for legal, financial,
                  hiring, or operational decisions.
                </p>
              </section>

              <section id="ip-rights" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">6. Intellectual Property Rights</h2>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>
                    All software, content, trademarks, designs, and materials are owned by
                    {' {{COMPANY_NAME}} '} or their respective rights holders.
                  </li>
                  <li>
                    No license is granted except as expressly stated in writing by the relevant
                    owner.
                  </li>
                  <li>
                    You may not copy, frame, modify, republish, reverse engineer, resell, or
                    distribute protected content without permission.
                  </li>
                  <li>
                    Limited personal-use printing/downloading is allowed only where legally
                    permitted and consistent with these Terms.
                  </li>
                </ul>
              </section>

              <section id="user-declarations" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">7. User Declarations</h2>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Keep account credentials and verification codes confidential.</li>
                  <li>Provide accurate, current, and authorized information.</li>
                  <li>Comply with applicable law, regulation, and platform policies.</li>
                  <li>Accept responsibility for all account activities and submitted inputs.</li>
                  <li>Do not upload forged, fraudulent, or unauthorized documents or data.</li>
                </ul>
              </section>

              <section id="usage-restrictions" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">8. Usage Restrictions</h2>
                <p className="mb-2">You must not, directly or indirectly:</p>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Violate any applicable local, national, or international law.</li>
                  <li>Use the platform for fraud, deception, or unauthorized activity.</li>
                  <li>
                    Attempt unauthorized access, scraping, password attacks, or system interference.
                  </li>
                  <li>Upload malware, spyware, harmful code, or unlawful/offensive content.</li>
                  <li>Download or use user directories/content without required consent.</li>
                  <li>Use fake identities, fake payment credentials, or forged documents.</li>
                  <li>Copy or resell any part of the platform without authorization.</li>
                </ul>
              </section>

              <section id="liability" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">9. Limits of Liability</h2>
                <p>
                  To the fullest extent permitted by law, {'{{COMPANY_NAME}}'} and its service
                  providers are not liable for indirect, incidental, consequential, punitive, or
                  special damages, including loss of data, profits, contracts, or business
                  opportunities arising from use of the platform, payment interruptions, internet
                  failures, force majeure events, or third-party misconduct.
                </p>
              </section>

              <section id="no-warranty" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">10. Waiver of Claims / No Warranty</h2>
                <p>
                  The platform and related content are provided on an &ldquo;as is&rdquo; and
                  &ldquo;as available&rdquo; basis, without warranties of any kind except where such
                  exclusions are not allowed by law. Communications sent through the platform do not
                  create ownership rights, confidentiality guarantees, or additional licenses unless
                  explicitly stated.
                </p>
              </section>

              <section id="indemnification" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">11. Indemnification</h2>
                <p>
                  You agree to defend, indemnify, and hold harmless {'{{COMPANY_NAME}}'}, its
                  affiliates, officers, employees, and agents from claims, liabilities, costs, and
                  legal fees arising from your breach of these Terms, unlawful conduct, policy
                  violations, or misuse of the platform.
                </p>
              </section>

              <section id="suspension-termination" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">12. Suspension and Termination</h2>
                <p className="mb-2">
                  If we determine that a violation occurred, we may take one or more actions:
                </p>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Issue warnings or corrective notices.</li>
                  <li>Suspend or terminate access temporarily or permanently.</li>
                  <li>Remove content, submissions, or account data as permitted by law.</li>
                  <li>
                    Initiate legal proceedings and report to competent authorities when required.
                  </li>
                </ul>
              </section>

              <section id="subscription" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">13. Subscription Terms</h2>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Standard subscription term: {'{{SUBSCRIPTION_TERM}}'}.</li>
                  <li>Subscription transferability: {'{{SUBSCRIPTION_TRANSFER_RULE}}'}.</li>
                  <li>Account authorization management: {'{{ACCOUNT_ADMIN_RULE}}'}.</li>
                  <li>Cancellation and re-subscription conditions: {'{{CANCELLATION_RULE}}'}.</li>
                  <li>Refund policy: {'{{SUBSCRIPTION_REFUND_RULE}}'}.</li>
                </ul>
              </section>

              <section id="payments" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">
                  14. Payment and Financial Transactions
                </h2>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Approved payment methods: {'{{PAYMENT_METHODS}}'}.</li>
                  <li>
                    You are responsible for payment activity outside {'{{PLATFORM_NAME}}'} channels.
                  </li>
                  <li>Paid amounts are non-refundable except where required by law.</li>
                  <li>
                    We may introduce, update, or revise fees and pricing with notice as required by
                    law.
                  </li>
                </ul>
              </section>

              <section id="virus-protection" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">
                  15. Virus Protection and Technical Risk
                </h2>
                <p>
                  We apply reasonable scanning and security controls, but cannot guarantee that the
                  platform or linked resources are free from harmful code. You are responsible for
                  device protection, antivirus usage, and secure browsing practices.
                </p>
              </section>

              <section id="links" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">16. Links To and From the Platform</h2>
                <p className="mb-2">
                  <strong>Linking to the platform.</strong> You may not frame, mirror, or link to
                  the platform without written permission where required by our policy. We may
                  revoke link permissions, impose linking conditions, and disable unauthorized
                  links.
                </p>
                <p>
                  <strong>Third-party links.</strong> External links are provided for convenience
                  only. We do not control or endorse third-party content and are not responsible for
                  third-party availability, reliability, legality, or security.
                </p>
              </section>

              <section id="severability" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">
                  17. Partial Invalidity (Severability)
                </h2>
                <p>
                  If any provision is found invalid, unlawful, or unenforceable, the remainder of
                  these Terms remains valid and enforceable to the maximum extent permitted by law.
                </p>
              </section>

              <section id="governing-law" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">18. Applicable Law and Jurisdiction</h2>
                <p>
                  These Terms are governed by the laws of {'{{GOVERNING_COUNTRY_OR_STATE}}'}. Courts
                  in {' {{DISPUTE_VENUE_CITY}} '} have jurisdiction unless mandatory law specifies
                  otherwise.
                </p>
              </section>

              <section id="language" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">19. Authorized Language</h2>
                <p>
                  The controlling language of these Terms is {'{{PRIMARY_LANGUAGE}}'}. Any
                  translation is provided for convenience and does not control legal interpretation
                  unless required by law.
                </p>
              </section>

              <section id="contact" className={sectionClassName}>
                <h2 className="mb-4 text-2xl font-semibold">20. Contact Methods</h2>
                <p>
                  For inquiries, complaints, claims, or disputes related to the platform or these
                  Terms, contact us via {'{{SUPPORT_CONTACT_CHANNEL}}'} or{' '}
                  {'{{LEGAL_CONTACT_EMAIL}}'}. Notices are deemed received only when acknowledged
                  according to your official notice policy.
                </p>
              </section>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
