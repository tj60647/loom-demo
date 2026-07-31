// The worked example from loom-v14-example.html — Star & Griesemer 1989, with
// model triage AND a model read in a plausible first-year voice (smart, but
// hasn't read Latour). Static authored content: loading it is an explicit
// student act, nothing is generated (red lines #1/#2), and reset removes it.
//
// Keys are symbolic; the loader creates real rows (with server ids) through the
// ordinary mutation path, so a loaded example is indistinguishable in shape
// from work the student did by hand.

export type ExampleConcept = {
  key: string
  label: string
  def: string
  note: string
  tier: "" | "p" | "s" | "t" | "x"
}

export type ExampleByte = {
  conceptKey: string
  source: string
  location: string
  text: string
}

export type ExampleEdge = {
  fromKey: string
  toKey: string
  handle: string
  sentence: string
}

export type WorkedExample = {
  title: string
  read: string
  concepts: ExampleConcept[]
  bytes: ExampleByte[]
  edges: ExampleEdge[]
}

const SRC = "Star & Griesemer, Institutional Ecology, 'Translations' and Boundary Objects"

/**
 * The reading the worked example is captured from. Reading-first gives it a
 * card on the shelf when the example loads — without one its passages would
 * have no door and the example would land in an app with an empty shelf.
 */
export const WORKED_EXAMPLE_SOURCE = {
  title: "Institutional Ecology, 'Translations' and Boundary Objects",
  author: "Star & Griesemer",
  sourceReference: "Social Studies of Science 19(3), 1989",
}

export const WORKED_EXAMPLE: WorkedExample = {
  title: "worked example · Star & Griesemer",
  read:
    "I think this paper is about how a big project keeps working when the people on it want different things and never really agree. The museum runs anyway, and Star says two things make that possible: shared objects that each group reads its own way but everyone still recognizes (boundary objects), and standard methods — everyone fills out the same form even if they care about it for different reasons. Both of them enable cooperation without consensus, which feels like the core idea. She also argues against an older model where everything has to pass through one gate (some theory she's pushing back on — I haven't read it), saying translation runs many-to-many instead. Not sure yet where 'immutable mobiles' fits — I flagged it but never captured a passage for it.",
  concepts: [
    { key: "c1", label: "boundary objects", def: "a thing that means different things to different groups but still holds them together", note: "", tier: "p" },
    { key: "c2", label: "the central tension", def: "science needs many kinds of people AND findings everyone can use — the two pull against each other", note: "", tier: "p" },
    { key: "c3", label: "cooperation without consensus", def: "you don't have to agree to work together", note: "", tier: "p" },
    { key: "c4", label: "translation", def: "the work of making one group's concerns readable to another", note: "", tier: "s" },
    { key: "c5", label: "obligatory passage point", def: "the older model's funnel — everything squeezed through one gate (usually the scientist's)", note: "", tier: "s" },
    { key: "c6", label: "methods standardization", def: "everyone collects the same way, even if they mean different things by it", note: "", tier: "s" },
    { key: "c7", label: "the ideal type", def: "a vague-on-purpose shared object — a good-enough map for all parties", note: "", tier: "t" },
    { key: "c8", label: "immutable mobiles", def: "", note: "a borrowed term she uses for the standardized forms. need to capture a passage.", tier: "" },
  ],
  bytes: [
    { conceptKey: "c1", source: SRC, location: "p. 393", text: "Boundary objects are objects which are both plastic enough to adapt to local needs and the constraints of the several parties employing them, yet robust enough to maintain a common identity across sites. They are weakly structured in common use, and become strongly structured in individual-site use. These objects may be abstract or concrete. They have different meanings in different social worlds but their structure is common enough to more than one world to make them recognizable, a means of translation." },
    { conceptKey: "c2", source: SRC, location: "p. 387", text: "Simply put, scientific work is heterogeneous. At the same time, science requires cooperation — to create common understandings, to ensure reliability across domains and to gather information which retains its integrity across time, space and local contingencies. This creates a 'central tension' in science between divergent viewpoints and the need for generalizable findings." },
    { conceptKey: "c3", source: SRC, location: "p. 413", text: "When participants in the intersecting worlds create representations together, their different commitments and perceptions are resolved into representations — in the sense that a fuzzy image is resolved by a microscope. This resolution does not mean consensus. Rather, representations, or inscriptions, contain at every stage the traces of multiple viewpoints, translations and incomplete battles." },
    { conceptKey: "c4", source: SRC, location: "p. 387 (abstract)", text: "Extending the Latour-Callon model of interessement, two major activities are central for translating between viewpoints: standardization of methods, and the development of 'boundary objects'." },
    { conceptKey: "c6", source: SRC, location: "p. 387 (abstract)", text: "Extending the Latour-Callon model of interessement, two major activities are central for translating between viewpoints: standardization of methods, and the development of 'boundary objects'." },
    { conceptKey: "c5", source: SRC, location: "p. 390", text: "First, their model can be seen as a kind of 'funnelling' — reframing or mediating the concerns of several actors into a narrower passage point. The story in this case is necessarily told from the point of view of one passage point — usually the manager, entrepreneur, or scientist. But it is a many-to-many mapping, where several obligatory points of passage are negotiated with several kinds of allies." },
    { conceptKey: "c7", source: SRC, location: "p. 410", text: "Ideal type. This is an object such as a diagram, atlas or other description which in fact does not accurately describe the details of any one locality or thing. It is abstracted from all domains, and may be fairly vague. However, it is adaptable to a local site precisely because it is fairly vague; it serves as a means of communicating and cooperating symbolically — a 'good enough' road map for all parties. An example of an ideal type is the species." },
  ],
  edges: [
    { fromKey: "c2", toKey: "c1", handle: "calls for", sentence: "because science has to hold many viewpoints together while still producing findings everyone can use, you need something that can live in all those worlds at once — that's what the boundary object is for." },
    { fromKey: "c1", toKey: "c3", handle: "enables", sentence: "because the object holds a different meaning for each group but stays recognizable to all of them, the groups can work together without ever agreeing on what it means." },
    { fromKey: "c6", toKey: "c3", handle: "enables", sentence: "the standard forms do the same job from the other side — everyone collects and records the same way, even when they mean different things by it, so the work still adds up." },
    { fromKey: "c7", toKey: "c1", handle: "is a kind of", sentence: "the species concept is a boundary object of the vague kind — abstract enough to fit every site, good enough for amateurs and professionals to use together." },
    { fromKey: "c1", toKey: "c4", handle: "is a means of", sentence: "the object is the medium of translation — its structure is recognizable in more than one world, so meaning can travel across without collapsing into one version." },
    { fromKey: "c5", toKey: "c4", handle: "", sentence: "the paper pushes against the older one-gate model — translation here runs many-to-many, with several passage points and no single gatekeeper." },
  ],
}
