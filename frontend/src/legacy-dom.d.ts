// The copied frontend delegates to the existing dynamically rendered modules.
// New preview components use explicit DOM types in design.ts.
interface Document {
  querySelector<T = any>(selectors: string): T;
  querySelectorAll<T extends Element = HTMLElement>(selectors: string): NodeListOf<T>;
}
declare module '*.js';
