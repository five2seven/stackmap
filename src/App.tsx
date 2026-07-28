import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="StackMap home">
          {'StackMap'}
        </a>
        <nav aria-label="Primary navigation">
          <a href="#overview">Overview</a>
          <a href="#next-steps">Next steps</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="overview">
          <p className="eyebrow">React application starter</p>
          <h1>{'StackMap'}</h1>
          <p className="summary">{'A local-first homelab planning application'}</p>
        </section>

        <section className="content-card" id="next-steps">
          <h2>Ready for your application</h2>
          <p>
            Replace this neutral shell with product-specific routes, components,
            and styles as requirements become clear.
          </p>
        </section>
      </main>

      <footer>
        <p>{'StackMap'} starter template</p>
      </footer>
    </div>
  )
}

export default App
