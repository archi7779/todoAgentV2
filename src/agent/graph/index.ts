import { logger } from "@/src/lib/logger";
import { App, buildApp } from "./buildGraph";

export type { AgentNodeName, AgentStreamInput } from "./buildGraph";

let appPromise: Promise<App> | null = null;

export function getApp(): Promise<App> {
  if (!appPromise) {
    appPromise = buildApp().catch((err) => {
      appPromise = null;
      logger.error({ tool: "agent", err }, "buildApp failed");
      throw err;
    });
  }
  return appPromise;
}
  

// export function getApp(provider: ProviderName, model?: string): Promise<App> {
//   const key = `${provider}:${model ?? "default"}`;
//   let p = apps.get(key);
//   if (!p) {
//     p = buildApp({ provider, model }).catch((err) => {
//       apps.delete(key);          // не кэшируем неудачу
//       log.error({ component: "agent", provider, model, err }, "buildApp: сборка не удалась");
//       throw err;
//     });
//     apps.set(key, p);
//   }
//   return p;
// }
//КОГда с фронта имя модели будем кидать