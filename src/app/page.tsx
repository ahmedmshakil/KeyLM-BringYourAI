import Link from 'next/link';

export default function Home() {
  return (
    <main className="landing-container">
      <section className="hero">
        <div>
          <span className="badge">BYOK Multi-Provider</span>
          <h1>KeyLM - Bring Your AI keys, keep control.</h1>
          <p>
            Connect OpenAI, Gemini, and Anthropic in one workspace. Your keys stay encrypted, models stay
            organized, and streaming stays fast.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/app">
              Open the App
            </Link>
            <Link className="button secondary" href="/docs">
              Read the Docs
            </Link>
          </div>
        </div>
        <div className="grid">
          <div className="card">
            <h3>Provider Vault</h3>
            <p>Store keys once, validate fast, rotate anytime. We only keep encrypted secrets.</p>
          </div>
          <div className="card">
            <h3>Unified Threads</h3>
            <p>Switch models without losing context. Threads stay locked per provider by default.</p>
          </div>
          <div className="card">
            <h3>Streaming First</h3>
            <p>Token-by-token responses with stop controls and retry-ready message IDs.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
