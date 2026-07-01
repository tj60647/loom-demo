export const STOP = new Set("the a an and or but of to in on at by for with as is are was were be been being do does did has have had that this these those it its they them their there here both one two also so than then thus into over under about not no nor only just more most very can could would should may might will what when where which who how each other another out off up down you your i we our it's don't kind sort bit".split(' '));

export function contentWords(t: string){
  return [...new Set((t.toLowerCase().match(/[a-z][a-z'\-]{2,}/g)||[]).filter(w=>!STOP.has(w)))].slice(0,14);
}
