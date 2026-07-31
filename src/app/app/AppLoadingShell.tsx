'use client';

export function AppLoadingShell() {
  return (
    <main className="app-container app-loading-shell" aria-busy="true" aria-label="Loading workspace">
      <header className="main-header">
        <div className="header-left">
          <div className="skeleton-block skeleton-line short" />
        </div>
        <div className="header-center">
          <div className="skeleton-block skeleton-line medium" />
        </div>
        <div className="header-right">
          <div className="skeleton-block skeleton-pill" />
        </div>
      </header>
      <div className="app-shell-new">
        <aside className="threads-sidebar">
          <div className="skeleton-block skeleton-card" />
          <div className="skeleton-block skeleton-card" />
          <div className="skeleton-block skeleton-card" />
        </aside>
        <section className="chat-section">
          <div className="card chat-box">
            <div className="chat-messages">
              <div className="skeleton-block skeleton-bubble" />
              <div className="skeleton-block skeleton-bubble wide" />
              <div className="skeleton-block skeleton-bubble" />
            </div>
            <div className="skeleton-block skeleton-composer" />
          </div>
        </section>
        <aside className="providers-sidebar">
          <div className="skeleton-block skeleton-card tall" />
          <div className="skeleton-block skeleton-card tall" />
        </aside>
      </div>
    </main>
  );
}
