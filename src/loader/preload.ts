import { deepmerge } from 'deepmerge-ts';
import { allPlugins, preloadPlugins } from 'virtual:plugins';

import { LoggerPrefix, startPlugin, stopPlugin } from '@/utils';

import config from '@/config';

import type { PreloadContext } from '@/types/contexts';
import type { PluginConfig, PluginDef } from '@/types/plugins';

const loadedPluginMap: Record<
  string,
  PluginDef<unknown, unknown, unknown>
> = {};
const createContext = (id: string): PreloadContext<PluginConfig> => ({
  getConfig: () =>
    deepmerge(
      allPlugins[id].config ?? { enabled: false },
      config.get(`plugins.${id}`) ?? {},
    ) as PluginConfig,
  setConfig: (newConfig) => {
    config.setPartial(`plugins.${id}`, newConfig, allPlugins[id].config);
  },
});

export const forceUnloadPreloadPlugin = async (id: string) => {
  if (!loadedPluginMap[id]) return;

  const hasStopped = await stopPlugin(id, loadedPluginMap[id], {
    ctx: 'preload',
    context: createContext(id),
  });
  if (hasStopped || (hasStopped === null && loadedPluginMap[id].preload)) {
    console.log(
      LoggerPrefix,
      `Plugins unloaded: ${id}`,
    );
    delete loadedPluginMap[id];
  } else {
    console.error(
      LoggerPrefix,
      `Plugins unload failed: ${id}`,
    );
  }
};

export const forceLoadPreloadPlugin = async (id: string) => {
  try {
    const plugin = preloadPlugins[id];
    if (!plugin) return;

    const hasStarted = await startPlugin(id, plugin, {
      ctx: 'preload',
      context: createContext(id),
    });

    if (
      hasStarted ||
      (hasStarted === null &&
        typeof plugin.preload !== 'function' &&
        plugin.preload)
    ) {
      loadedPluginMap[id] = plugin;
    }

    console.log(
      LoggerPrefix,
      `Plugins loaded: ${id}`,
    );
  } catch (err) {
    console.error(
      LoggerPrefix,
      `Plugins initialize failed: ${id}`,
    );
    console.trace(err);
  }
};

export const loadAllPreloadPlugins = () => {
  const pluginConfigs = config.plugins.getPlugins();

  for (const [pluginId, pluginDef] of Object.entries(preloadPlugins)) {
    const config = deepmerge(
      pluginDef.config ?? { enable: false },
      pluginConfigs[pluginId] ?? {},
    );

    if (config.enabled) {
      forceLoadPreloadPlugin(pluginId);
    } else {
      if (loadedPluginMap[pluginId]) {
        forceUnloadPreloadPlugin(pluginId);
      }
    }
  }
};

export const unloadAllPreloadPlugins = async () => {
  for (const id of Object.keys(loadedPluginMap)) {
    await forceUnloadPreloadPlugin(id);
  }
};

export const getLoadedPreloadPlugin = (
  id: string,
): PluginDef<unknown, unknown, unknown> | undefined => {
  return loadedPluginMap[id];
};

export const getAllLoadedPreloadPlugins = () => {
  return loadedPluginMap;
};
