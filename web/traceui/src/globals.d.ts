// Side-effect CSS imports are handled by esbuild's bundler, which emits a
// content-hashed stylesheet. They carry no TypeScript surface, so they are
// declared as empty modules for the type checker.
declare module "*.css";
