// Packages browser-extension/competitor-capture into a reproducible source-only ZIP with
// manifest.json at the archive root. Pure Node (zlib): fixed timestamps, sorted entries,
// no external attributes, so identical sources always yield identical bytes.
//
// Usage: node scripts/package-competitor-extension.mjs [--out <path>]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_DIR = path.join(ROOT, "browser-extension", "competitor-capture");
export const DEFAULT_OUT = path.join(ROOT, "public", "downloads", "retirefarm-competitor-capture.zip");
/** Explicit allowlist keeps the archive source-only; anything else in the folder is ignored. */
export const PACKAGED_FILES = Object.freeze(["README.md", "capture.js", "manifest.json", "popup.css", "popup.html", "popup.js", "search-capture.js"]);
const EXPECTED_PERMISSIONS = ["activeTab", "scripting", "clipboardWrite"];
// 2026-09-01 00:00:00 in MS-DOS date/time encoding; constant so the archive never depends on mtimes.
const DOS_DATE = ((2026 - 1980) << 9) | (9 << 5) | 1;
const DOS_TIME = 0;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const u16 = (value) => { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; };
const u32 = (value) => { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; };

/** Deflate (method 8) when it helps, otherwise store (method 0); both deterministic. */
const encodeEntry = (name, data) => {
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  return { name: Buffer.from(name, "utf8"), method: useDeflate ? 8 : 0, crc: crc32(data), size: data.length, payload: useDeflate ? deflated : data };
};

/** Builds the whole archive in memory from [{ name, data }] entries (already sorted by caller). */
export const buildZip = (entries) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const entry = encodeEntry(name, data);
    const flags = u16(0x0800); // UTF-8 names
    const local = Buffer.concat([u32(0x04034b50), u16(20), flags, u16(entry.method), u16(DOS_TIME), u16(DOS_DATE), u32(entry.crc),
      u32(entry.payload.length), u32(entry.size), u16(entry.name.length), u16(0), entry.name, entry.payload]);
    const central = Buffer.concat([u32(0x02014b50), u16(20), u16(20), flags, u16(entry.method), u16(DOS_TIME), u16(DOS_DATE), u32(entry.crc),
      u32(entry.payload.length), u32(entry.size), u16(entry.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), entry.name]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralDirectory.length), u32(offset), u16(0)]);
  return Buffer.concat([...locals, centralDirectory, end]);
};

/** Lists entry names from a ZIP's central directory; used for self-verification and tests. */
export const listZipEntries = (zip) => {
  const endOffset = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOffset < 0) throw new Error("ZIP end-of-central-directory record not found");
  const count = zip.readUInt16LE(endOffset + 10);
  let cursor = zip.readUInt32LE(endOffset + 16);
  const names = [];
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Corrupt central directory");
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    names.push(zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
};

const validateManifest = (manifestJson) => {
  const manifest = JSON.parse(manifestJson);
  const permissions = [...(manifest.permissions ?? [])].sort();
  if (manifest.manifest_version !== 3) throw new Error("manifest_version must be 3");
  if (JSON.stringify(permissions) !== JSON.stringify([...EXPECTED_PERMISSIONS].sort())) throw new Error(`permissions must be exactly ${EXPECTED_PERMISSIONS.join(", ")}`);
  if (manifest.host_permissions || manifest.background || manifest.content_scripts) throw new Error("manifest must not declare host_permissions, background or content_scripts");
  if (manifestJson.includes("all_urls")) throw new Error("manifest must not reference all_urls");
};

/** Reads the allowlisted sources, validates the manifest, and returns the archive bytes. */
export const packageExtension = (sourceDir = SOURCE_DIR) => {
  const entries = PACKAGED_FILES.map((name) => {
    const file = path.join(sourceDir, name);
    if (!fs.existsSync(file)) throw new Error(`Missing extension source file: ${name}`);
    return { name, data: fs.readFileSync(file) };
  });
  const manifest = entries.find((entry) => entry.name === "manifest.json");
  if (!manifest) throw new Error("manifest.json is required at the archive root");
  validateManifest(manifest.data.toString("utf8"));
  const zip = buildZip(entries);
  const listed = listZipEntries(zip);
  if (!listed.includes("manifest.json")) throw new Error("Packaged archive lacks manifest.json at its root");
  return zip;
};

const parseOut = (argv) => {
  const index = argv.indexOf("--out");
  if (index === -1) return DEFAULT_OUT;
  const value = argv[index + 1];
  if (!value) throw new Error("--out requires a path");
  return path.resolve(value);
};

const main = () => {
  const out = parseOut(process.argv.slice(2));
  const zip = packageExtension();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zip);
  process.stdout.write(`Packaged ${PACKAGED_FILES.length} files (${zip.length} bytes) -> ${path.relative(ROOT, out) || out}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`package-competitor-extension failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
