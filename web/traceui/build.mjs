// esbuild build for TraceUI. Emits a minified, content-hashed bundle
// (JS + CSS) into dist/assets/ and writes dist/manifest.json mapping the
// logical entry to its hashed filenames. The Go handler reads the
// manifest to build the SSR shell with immutable, cache-forever asset URLs
// plus a modulepreload for the entry chunk.
//
//   node build.mjs           one-shot production build
//   node build.mjs --watch   rebuild on change + serve esbuild's live-reload
//                            EventSource at /esbuild (dev loop through Go)
import { context, build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: { main: "src/main.tsx" },
  bundle: true,
  format: "esm",
  splitting: false,
  target: ["es2022"],
  jsx: "automatic",
  jsxImportSource: "preact",
  minify: !watch,
  sourcemap: watch,
  legalComments: "none",
  entryNames: "assets/[name]-[hash]",
  assetNames: "assets/[name]-[hash]",
  // Fonts (Geist / Geist Mono, OFL, committed under src/fonts) are copied
  // into the hashed asset tree and referenced from the bundled CSS, so the
  // binary stays self-contained with no font network fetch at runtime.
  loader: { ".woff2": "file" },
  outdir,
  metafile: true,
  write: true,
  // Live-reload banner: esbuild serves an EventSource at /esbuild that the
  // page subscribes to and reloads on. Only injected in watch (dev) builds.
  banner: watch
    ? {
        js: `new EventSource("/esbuild").addEventListener("change", () => location.reload());`,
      }
    : {},
};

function writeManifest(result) {
  const out = result.metafile?.outputs ?? {};
  const manifest = { js: "", css: "" };
  for (const [file, meta] of Object.entries(out)) {
    const rel = file.replace(/^dist\//, "");
    if (file.endsWith(".js") && meta.entryPoint === "src/main.tsx") {
      manifest.js = rel;
    } else if (file.endsWith(".css")) {
      manifest.css = rel;
    }
  }
  if (!manifest.js || !manifest.css) {
    throw new Error(
      `build: incomplete manifest ${JSON.stringify(manifest)} — expected one JS entry and one CSS output`,
    );
  }
  writeFileSync(`${outdir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [
      {
        name: "manifest",
        setup(b) {
          b.onEnd((result) => {
            if (result.errors.length === 0) {
              const m = writeManifest(result);
              console.log(`built ${m.js}, ${m.css}`);
            }
          });
        },
      },
    ],
  });
  await ctx.watch();
  await ctx.serve({ servedir: outdir, port: 8788 });
  console.log("watching src/ — live reload via /esbuild");
} else {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(`${outdir}/assets`, { recursive: true });
  const result = await build(options);
  const m = writeManifest(result);
  console.log(`built ${m.js}, ${m.css}`);
}
