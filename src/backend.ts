import type { BackendContext } from "../vendor/hetu-sdk.ts";
import { CreativeProject } from "./application/project.ts";
let project: CreativeProject | undefined;
export function apply(context: BackendContext) {
  project = new CreativeProject(context);
  context.effect(() => {
    project = undefined;
  });
}
export async function invoke(action: string, input: unknown) {
  if (!project) throw new Error("插件未激活。");
  return project.invoke(action, input);
}
