import SEOProvider from '../../seo/SEOProvider';

export default function PrivacyPage() {
  return (
    <SEOProvider routeKey="/privacy">
      <section className="legal-page">
        <div className="legal-page__inner">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: June 2026</p>

          <section>
            <h2>1. Information We Collect</h2>
            <p>
              When you use Sarga Offset Printing services, we may collect personal information
              including your name, email address, phone number, and business details. We also
              collect usage data such as IP address, browser type, and pages visited.
            </p>
          </section>

          <section>
            <h2>2. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Process and fulfill your printing orders</li>
              <li>Communicate about order status and project updates</li>
              <li>Improve our services and website experience</li>
              <li>Send promotional communications (with your consent)</li>
            </ul>
          </section>

          <section>
            <h2>3. Data Protection</h2>
            <p>
              We implement appropriate security measures to protect your personal information
              against unauthorized access, alteration, disclosure, or destruction.
            </p>
          </section>

          <section>
            <h2>4. Third-Party Services</h2>
            <p>
              We may share your information with trusted third-party service providers who assist
              us in operating our business, such as payment processors and delivery partners.
            </p>
          </section>

          <section>
            <h2>5. Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal information. To
              exercise these rights, please contact us at the details provided on our contact page.
            </p>
          </section>

          <section>
            <h2>6. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us through our
              contact page or email us directly.
            </p>
          </section>
        </div>
      </section>
    </SEOProvider>
  );
}
