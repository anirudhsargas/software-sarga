import SEOProvider from '../../seo/SEOProvider';

export default function TermsPage() {
  return (
    <SEOProvider routeKey="/terms">
      <section className="legal-page">
        <div className="legal-page__inner">
          <h1>Terms of Service</h1>
          <p className="legal-updated">Last updated: June 2026</p>

          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using the Sarga Offset Printing website and services, you agree
              to be bound by these Terms of Service.
            </p>
          </section>

          <section>
            <h2>2. Services</h2>
            <p>
              Sarga Offset Printing provides offset printing, digital printing, packaging, and
              related design services. All services are subject to availability and the terms of
              individual project agreements.
            </p>
          </section>

          <section>
            <h2>3. Orders and Payments</h2>
            <p>
              Orders are confirmed upon receipt of payment or approved credit terms. Prices are
              quoted per project and may vary based on specifications, quantities, and materials.
            </p>
          </section>

          <section>
            <h2>4. Production and Delivery</h2>
            <p>
              Production timelines are estimated and communicated at order confirmation. Sarga
              Offset will make every effort to meet delivery dates but is not liable for delays
              caused by factors beyond our control.
            </p>
          </section>

          <section>
            <h2>5. Intellectual Property</h2>
            <p>
              All designs, artwork, and content created by Sarga Offset remain our intellectual
              property unless otherwise agreed in writing. Client-provided artwork must not
              infringe on third-party copyrights.
            </p>
          </section>

          <section>
            <h2>6. Limitation of Liability</h2>
            <p>
              Sarga Offset Printing liability is limited to the value of the specific order in
              question. We are not liable for indirect, incidental, or consequential damages.
            </p>
          </section>

          <section>
            <h2>7. Changes to Terms</h2>
            <p>
              We reserve the right to update these terms at any time. Changes will be posted on
              this page with an updated revision date.
            </p>
          </section>
        </div>
      </section>
    </SEOProvider>
  );
}
