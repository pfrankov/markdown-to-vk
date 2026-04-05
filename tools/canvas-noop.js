// Browser shim: @napi-rs/canvas is Node-only; never called in browser context.
export const createCanvas = () => { throw new Error("canvas not available in browser"); };
export const GlobalFonts = { registerFromPath: () => {} };
