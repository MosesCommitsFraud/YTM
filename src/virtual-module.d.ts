declare module 'virtual:plugins' {
  import type { PluginConfig, PluginDef } from '@/types/plugins';

  type Plugin = PluginDef<unknown, unknown, unknown, PluginConfig>;

  export const mainPlugins: Record<string, Plugin>;
  export const preloadPlugins: Record<string, Plugin>;
  export const rendererPlugins: Record<string, Plugin>;

  export const allPlugins: Record<
    string,
    Omit<Plugin, 'backend' | 'preload' | 'renderer'>
  >;
}
