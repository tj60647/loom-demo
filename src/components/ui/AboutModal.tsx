"use client"

/**
 * What Loom is, and the thinking behind it.
 *
 * Lifted out of Header unchanged so the reading-focus menu can open the same
 * dialog while the header stands down. The prose is the reason it is a
 * component rather than a copy: it is the one place the tool explains itself,
 * and two versions of it would drift apart on the first edit.
 *
 * Same ink scrim as every other overlay — the light blurred backdrop was the
 * one exception to the app's visual language.
 */
export default function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="info-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="info-dialog aboutbox" role="dialog" aria-modal="true" aria-label="About Loom">
        <button className="btn ghost mini info-close" onClick={onClose} aria-label="Close">✕</button>

        <span className="info-k">about</span>
        <h2>Loom</h2>
        <p className="info-note">Weaving knowledge through shared practice.</p>

        <p>Loom turns reading into weaving. You read anywhere — paper, PDF, screen — and bring the passages worth keeping here, where they become concepts, the concepts get threaded to one another, and the whole thing lays out as something you can read back. The structure is yours: the tool holds it and counts it, and never writes a word of it.</p>

        <h3>The five stations</h3>
        <ul>
          <li><b>00 Library</b> — the course&apos;s readings. Each card opens its own workbench, and the work you do behind it belongs to that text.</li>
          <li><b>01 Reading</b> — the text and your captures in one place. Highlight a passage, name the concept it evidences, and title your cloth: your own reading of the text as a whole.</li>
          <li><b>02 Linking</b> — pick two concepts and say how they hang together. That sentence IS the thread; a short label is a convenience that lets one of your words recur.</li>
          <li><b>03 Knowledge Graph</b> — sort your concepts into tiers and arrange them as cards on a board. Each arrangement is a projection: keep several, and each can say something different about the same cloth.</li>
          <li><b>04 Vocabulary</b> — every concept you have named and every label you have given a link, across all your readings. A concept does not belong to a text; a passage does.</li>
        </ul>

        <h3>What Loom will not do</h3>
        <p>Nothing here is generated for you. No model reads your work, ranks it, scores it or suggests what to write — the tool counts what you made and shows you the count. An empty state is a fact about where you have got to, not a fault to fix. And your work leaves as files wherever you made it: the cloth at 01, its threads at 02, a projection and your Capture Log at 03, your vocabulary at 04.</p>
        <p className="info-note">Loom is the middle step, not the deliverable. It gets you to a concept map you draw by hand, and to the talk you build from that.</p>

        <h3>The thinking behind it</h3>
        <ul>
          <li><b>Object Worlds (Bucciarelli):</b> each discipline inhabits its own world, with its own instruments and language. An engineer might name a connection &ldquo;is the bottleneck for&rdquo; where a humanist says it &ldquo;betrays&rdquo; the text. Loom keeps those differences visible instead of flattening them.</li>
          <li><b>Communities of Practice (Wenger):</b> a shared vocabulary is learned by doing the work alongside other people, not by being handed a glossary. A class grows its own link labels over a term.</li>
          <li><b>Boundary Objects (Star):</b> people from distinct fields coordinate around one shared object without agreeing on what it means. A cloth is meant to be exactly that — locally useful, and robust enough to hold across groups.</li>
          <li><b>Concept maps (Novak &amp; Gowin):</b> arranging cards by hand is the thinking. The board digitises the sorting; the map you draw afterwards is where it lands.</li>
        </ul>

      </div>
    </div>
  )
}
