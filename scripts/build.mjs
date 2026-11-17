import {createHash} from 'node:crypto';
import { build } from "esbuild";
import {
  mkdir,
  copyFile,
  readFile,
  writeFile,
  readdir,
  cp,
} from "node:fs/promises";
import path from "node:path";
const manifest = JSON.parse(
  await readFile("contracts/plugin-manifest.json", "utf8"),
);
const sourceManifest=JSON.parse(await readFile('vendor/sources.json','utf8'));
for(const f of sourceManifest.files)if(createHash('sha256').update(await readFile('vendor/'+f.file)).digest('hex')!==f.sha256)throw new Error('公开SDK或色板快照摘要变化：'+f.file);
const skill=manifest.contributions.skills[0];
const rows=['# 操作地图','','执行前读取当前能力Schema。本表由构建从清单生成。','','| 动作 | 用途 | 必填参数 | 效果 |','| --- | --- | --- | --- |'];
for(const a of manifest.contributions.actions)rows.push('| `'+a.id+'` | '+a.title+' | '+a.input_schema.required.map(k=>'`'+k+'`').join(', ')+' | '+a.effect+' |');
await writeFile('skills/'+skill.name+'/references/operations.md',rows.join('\n')+'\n');
const {newProject,newNode,validate}=await import('../src/domain/model.ts');
const example=newProject('雨港旧站');example.constraints='保留开放结局。';example.nodes[0].summary='林溪带着迟到的旧信回到雨港。';example.nodes.push(newNode('episode','episode','work','第一集 暴雨来信'),newNode('scene','scene','episode','候车亭的秘密'));validate(example);
await writeFile('docs/examples/project.json',JSON.stringify(example,null,2)+'\n');

await mkdir("dist", { recursive: true });
const backend = await build({
  entryPoints: ["src/backend.ts"],
  outfile: "dist/backend.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node25",
  metafile: true,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
const view = await build({
  entryPoints: ["src/view/index.tsx"],
  outfile: "dist/view.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome140",
  metafile: true,
  jsx: "automatic",
});
await writeFile("dist/plugin.json", JSON.stringify(manifest) + "\n");
await writeFile(
  "dist/index.html",
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>剧本创作</title><link rel="stylesheet" href="view.css"><div id="root"></div><script src="view.js"></script></html>',
);
for (const name of ["LICENSE", "CAPABILITIES.md"])
  await copyFile(name, "dist/" + name);
await cp("skills", "dist/skills", { recursive: true });
await mkdir("dist/licenses", { recursive: true });
await copyFile("vendor/hetu-LICENSE", "dist/licenses/hetu.txt");
await copyFile(
  "vendor/radix-colors-MIT.txt",
  "dist/licenses/radix-colors-MIT.txt",
);
await copyFile("vendor/sources.json", "dist/licenses/hetu-sources.json");
const packages = new Map();
for (const input of Object.keys({
  ...backend.metafile.inputs,
  ...view.metafile.inputs,
})) {
  if (!input.startsWith("node_modules/")) continue;
  let directory = path.dirname(input);
  while (directory !== ".") {
    try {
      const pkg = JSON.parse(
        await readFile(path.join(directory, "package.json"), "utf8"),
      );
      if (pkg.name) {
        packages.set(pkg.name, { directory, pkg });
        break;
      }
    } catch {}
    directory = path.dirname(directory);
  }
}
let notices =
  "# 第三方许可\n\n仅列入实际后端及视图产物包含的依赖；宿主来源另见 licenses/hetu-sources.json。\n\n";
for (const [name, { directory, pkg }] of [...packages].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const files = (await readdir(directory)).filter((f) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(f),
  );
  if (!files.length) throw new Error("缺少第三方许可：" + name);
  const filename = name.replaceAll("/", "_").replaceAll("@", "") + ".txt";
  const content = await Promise.all(
    files.sort().map((f) => readFile(path.join(directory, f), "utf8")),
  );
  await writeFile("dist/licenses/" + filename, content.join("\n\n"));
  notices += `- ${name}@${pkg.version} (${pkg.license}): licenses/${filename}\n`;
}
await writeFile("dist/THIRD_PARTY_NOTICES.md", notices);
for (const data of manifest.contributions.data) {
  const prefix = data.kind.replaceAll("_", "-");
  await writeFile(
    "docs/examples/" + prefix + ".schema.json",
    JSON.stringify(data.schema, null, 2) + "\n",
  );
}
await writeFile(
  "docs/examples/plugin-manifest.design.json",
  JSON.stringify(manifest, null, 1) + "\n",
);
