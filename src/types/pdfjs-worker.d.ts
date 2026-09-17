// pdfjs-dist ships this worker entry point without type declarations. We
// import it directly in src/lib/ai/extract.ts to work around a bundler
// issue with pdf-parse's runtime worker loading (see the comment there) —
// this just tells TypeScript the module exists.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
