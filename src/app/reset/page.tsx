import Link from 'next/link';

export default function ResetPage() {
  return (
    <main className="auth-container">
      <div className="auth-wrapper">
        <div className="auth-branding">
          <span className="badge glow">BYOK Workspace</span>
          <h1>KeyLM</h1>
          <p className="auth-tagline">Passwords are no longer needed for this workspace.</p>
        </div>
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>Use passwordless sign in</h2>
            <p>Request a secure 15-minute magic link or OTP from the sign-in screen.</p>
          </div>
          <Link className="auth-button primary" href="/app?auth=login">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
