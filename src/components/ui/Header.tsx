import AuthButton from "./AuthButton"

export default function Header() {
  return (
    <header>
      <div className="wordmark">
        <svg width="17" height="12" viewBox="0 0 26 18" fill="none" stroke="#a8843f" strokeWidth="1.8">
          <path d="M2 15 L7 4 L12 15 L17 4 L22 15"/>
        </svg>
        <div>Loom<small>lay the warp · throw the weft</small></div>
      </div>
      <div className="spacer"></div>
      <AuthButton />
      <a href="https://github.com/tj60647/loom-demo#readme" target="_blank" rel="noopener noreferrer" className="helpbtn" id="helpBtn" title="how Loom works" aria-label="how Loom works" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>?</a>
    </header>
  )
}
