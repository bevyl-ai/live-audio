import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "../packages/live-audio/dist");

async function* walk(directory) {
  for (const entry of await readdir(directory)) {
    const entryPath = path.join(directory, entry);
    const entryStat = await stat(entryPath);

    if (entryStat.isDirectory()) {
      yield* walk(entryPath);
    } else if (entryPath.endsWith(".js") || entryPath.endsWith(".d.ts")) {
      yield entryPath;
    }
  }
}

async function resolveRuntimeSpecifier(filePath, specifier) {
  if (!specifier.startsWith(".") || path.extname(specifier) !== "") {
    return specifier;
  }

  const targetPath = path.resolve(path.dirname(filePath), specifier);
  if (await exists(`${targetPath}.js`)) {
    return `${specifier}.js`;
  }

  if (await exists(path.join(targetPath, "index.js"))) {
    return `${specifier}/index.js`;
  }

  return specifier;
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function rewriteFile(filePath) {
  const source = await readFile(filePath, "utf8");
  let output = source;

  output = await replaceAsync(
    output,
    /(from\s+['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g,
    async (_match, prefix, specifier, suffix) =>
      `${prefix}${await resolveRuntimeSpecifier(filePath, specifier)}${suffix}`,
  );
  output = await replaceAsync(
    output,
    /(import\s*\(\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"]\s*\))/g,
    async (_match, prefix, specifier, suffix) =>
      `${prefix}${await resolveRuntimeSpecifier(filePath, specifier)}${suffix}`,
  );

  if (output !== source) {
    await writeFile(filePath, output);
  }
}

async function replaceAsync(source, pattern, replacer) {
  const matches = [...source.matchAll(pattern)];
  const replacements = await Promise.all(
    matches.map((match) => replacer(...match)),
  );

  let cursor = 0;
  let output = "";
  for (const [index, match] of matches.entries()) {
    output += source.slice(cursor, match.index);
    output += replacements[index];
    cursor = match.index + match[0].length;
  }

  return output + source.slice(cursor);
}

for await (const filePath of walk(distDir)) {
  await rewriteFile(filePath);
}
