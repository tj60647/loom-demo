export default function LibraryTab() {
  return (
    <div className="card" style={{ maxWidth: "600px", margin: "40px auto" }}>
      <h2>00 Library</h2>
      <p className="do calm">Foundational texts for ethnographic coding, object worlds, and boundary objects.</p>
      
      <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        
        <div style={{ padding: "16px", border: "1px solid var(--rule)", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>Object Worlds</h3>
          <p className="hint" style={{ margin: "0 0 12px 0" }}>Bucciarelli — Designing Engineers</p>
          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
            Explores how different disciplines inhabit their own "worlds" with distinct instruments and languages. Useful for understanding how different experts might code the same concept in completely different ways.
          </p>
          <a href="https://github.com/tj60647/loom-demo/blob/master/docs/readings/Bucciarelli-Designing%20Engineers.pdf" target="_blank" rel="noopener noreferrer" className="btn mini ghost">View PDF on GitHub</a>
        </div>
        
        <div style={{ padding: "16px", border: "1px solid var(--rule)", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>Communities of Practice</h3>
          <p className="hint" style={{ margin: "0 0 12px 0" }}>Wenger</p>
          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
            Details how shared vocabularies are learned by participating in a community. In Loom, you grow a shared edge-vocabulary over time by coding together.
          </p>
          <a href="https://github.com/tj60647/loom-demo/blob/master/docs/readings/Wenger_communities-of-practice.pdf" target="_blank" rel="noopener noreferrer" className="btn mini ghost">View PDF on GitHub</a>
        </div>
        
        <div style={{ padding: "16px", border: "1px solid var(--rule)", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>Boundary Objects</h3>
          <p className="hint" style={{ margin: "0 0 12px 0" }}>Star, 2010 — 'This Is Not A Boundary Object'</p>
          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
            How distinct fields coordinate around one shared object without agreeing on its exact meaning. Loom serves as a boundary object, holding a common identity across different disciplinary "tongues".
          </p>
          <a href="https://github.com/tj60647/loom-demo/blob/master/docs/readings/Star,%202010%20'This%20Is%20Not%20A%20Boundary%20Object'.pdf" target="_blank" rel="noopener noreferrer" className="btn mini ghost">View PDF on GitHub</a>
        </div>
        
      </div>
    </div>
  )
}
