import { createVisualRegistry, registerGrammar } from '../runtime.ts';
import { arraySearch } from './array-search.tsx';
import { flow, stateTransition } from './graph.tsx';
import { plot } from './plot.tsx';
export { arraySearch, flow, stateTransition, plot };
export const defaultVisualRegistry = createVisualRegistry([
  registerGrammar(arraySearch),
  registerGrammar(flow),
  registerGrammar(stateTransition),
  registerGrammar(plot),
]);
