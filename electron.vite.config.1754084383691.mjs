// electron.vite.config.mts
import { dirname as dirname4, join, resolve as resolve4 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";
import { defineConfig, defineViteConfig } from "electron-vite";
import builtinModules from "builtin-modules";
import Inspect from "vite-plugin-inspect";
import solidPlugin from "vite-plugin-solid";
import viteResolve from "vite-plugin-resolve";
import { withFilter } from "vite";

// vite-plugins/plugin-importer.mts
import { basename, relative, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";
import { Project } from "ts-morph";
var __electron_vite_injected_import_meta_url = "file:///C:/DEV/YTM/vite-plugins/plugin-importer.mts";
var snakeToCamel = (text) => text.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
var __dirname = dirname(fileURLToPath(__electron_vite_injected_import_meta_url));
var globalProject = new Project({
  tsConfigFilePath: resolve(__dirname, "..", "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
  skipLoadingLibFiles: true,
  skipFileDependencyResolution: true
});
var pluginVirtualModuleGenerator = (mode) => {
  const srcPath = resolve(__dirname, "..", "src");
  const plugins = globSync([
    "src/plugins/*/index.{js,ts,jsx,tsx}",
    "src/plugins/*.{js,ts,jsx,tsx}",
    "!src/plugins/utils/**/*",
    "!src/plugins/utils/*"
  ]).map((path) => {
    let name = basename(path);
    if (name === "index.ts" || name === "index.js" || name === "index.jsx" || name === "index.tsx") {
      name = basename(resolve(path, ".."));
    }
    name = name.replace(extname(name), "");
    return { name, path };
  });
  const src = globalProject.createSourceFile(
    "vm:pluginIndexes",
    (writer) => {
      for (const { name, path } of plugins) {
        const relativePath = relative(resolve(srcPath, ".."), path).replace(/\\/g, "/");
        writer.writeLine(`import ${snakeToCamel(name)}Plugin, { pluginStub as ${snakeToCamel(name)}PluginStub } from "./${relativePath}";`);
      }
      writer.blankLine();
      writer.writeLine(`export const ${mode}Plugins = {`);
      for (const { name } of plugins) {
        const checkMode = mode === "main" ? "backend" : mode;
        writer.writeLine(
          `  ...(${snakeToCamel(name)}Plugin['${checkMode}'] ? { "${name}": ${snakeToCamel(name)}Plugin } : {}),`
        );
      }
      writer.writeLine("};");
      writer.blankLine();
      writer.writeLine("export const allPlugins = {");
      for (const { name } of plugins) {
        writer.writeLine(`  "${name}": ${snakeToCamel(name)}PluginStub,`);
      }
      writer.writeLine("};");
      writer.blankLine();
    },
    { overwrite: true }
  );
  return src.getText();
};

// vite-plugins/plugin-loader.mts
import { readFileSync } from "node:fs";
import { resolve as resolve2, basename as basename2, dirname as dirname2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import {
  Project as Project2,
  ts,
  VariableDeclarationKind
} from "ts-morph";
var __electron_vite_injected_import_meta_url2 = "file:///C:/DEV/YTM/vite-plugins/plugin-loader.mts";
var __dirname2 = dirname2(fileURLToPath2(__electron_vite_injected_import_meta_url2));
var globalProject2 = new Project2({
  tsConfigFilePath: resolve2(__dirname2, "..", "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
  skipLoadingLibFiles: true,
  skipFileDependencyResolution: true
});
var getPropertyName = (prop) => {
  const kind = prop.getKind();
  if (kind === ts.SyntaxKind.PropertyAssignment || kind === ts.SyntaxKind.ShorthandPropertyAssignment || kind === ts.SyntaxKind.MethodDeclaration) {
    return prop.getFirstChildByKindOrThrow(ts.SyntaxKind.Identifier).getText();
  }
  return null;
};
function plugin_loader_default(mode) {
  return {
    name: "ytm-plugin-loader",
    load: {
      filter: {
        id: /(?:\/plugins\/[^/]+\/index\.(?:js|ts|jsx|tsx)|\/plugins\/[^/]+\.(?:js|ts|jsx|tsx))$/
      },
      handler(id) {
        const fileContent = readFileSync(id, "utf8");
        const src = globalProject2.createSourceFile(
          "_pf" + basename2(id),
          fileContent,
          { overwrite: true }
        );
        let objExpr;
        const defaultExportAssignment = src.getExportAssignment(
          (ea) => !ea.isExportEquals()
          // Filter out `export = `
        );
        if (defaultExportAssignment) {
          const expression = defaultExportAssignment.getExpression();
          if (expression.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
            objExpr = expression.asKindOrThrow(
              ts.SyntaxKind.ObjectLiteralExpression
            );
          } else if (expression.getKind() === ts.SyntaxKind.CallExpression) {
            const callExpr = expression.asKindOrThrow(
              ts.SyntaxKind.CallExpression
            );
            if (callExpr.getArguments().length === 1 && callExpr.getExpression().getText() === "createPlugin") {
              const arg = callExpr.getArguments()[0];
              if (arg.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
                objExpr = arg.asKindOrThrow(
                  ts.SyntaxKind.ObjectLiteralExpression
                );
              }
            }
          }
        }
        if (!objExpr) {
          const defaultExportDeclaration = src.getExportedDeclarations().get("default");
          if (defaultExportDeclaration && defaultExportDeclaration.length > 0) {
            const expr = defaultExportDeclaration[0];
            if (expr.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
              objExpr = expr.asKindOrThrow(
                ts.SyntaxKind.ObjectLiteralExpression
              );
            } else if (expr.getKind() === ts.SyntaxKind.CallExpression) {
              const callExpr = expr.asKindOrThrow(ts.SyntaxKind.CallExpression);
              if (callExpr.getArguments().length === 1 && callExpr.getExpression().getText() === "createPlugin") {
                const arg = callExpr.getArguments()[0];
                if (arg.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
                  objExpr = arg.asKindOrThrow(
                    ts.SyntaxKind.ObjectLiteralExpression
                  );
                }
              }
            }
          }
        }
        if (!objExpr) return null;
        const propMap = /* @__PURE__ */ new Map();
        for (const prop of objExpr.getProperties()) {
          const name = getPropertyName(prop);
          if (name) propMap.set(name, prop);
        }
        const contexts = ["backend", "preload", "renderer", "menu"];
        for (const ctx of contexts) {
          if (mode === "none" && propMap.has(ctx)) {
            propMap.get(ctx)?.remove();
            continue;
          }
          if (ctx === mode || ctx === "menu" && mode === "backend") continue;
          if (propMap.has(ctx)) propMap.get(ctx)?.remove();
        }
        const varStmt = src.addVariableStatement({
          isExported: true,
          declarationKind: VariableDeclarationKind.Const,
          declarations: [
            {
              name: "pluginStub",
              initializer: (writer) => writer.write(objExpr.getText())
            }
          ]
        });
        const stubObjExpr = varStmt.getDeclarations()[0].getInitializerIfKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression);
        const stubMap = /* @__PURE__ */ new Map();
        for (const prop of stubObjExpr.getProperties()) {
          const name = getPropertyName(prop);
          if (name) stubMap.set(name, prop);
        }
        const stubContexts = mode === "backend" ? contexts.filter((ctx) => ctx !== "menu") : contexts;
        for (const ctx of stubContexts) {
          if (stubMap.has(ctx)) {
            stubMap.get(ctx)?.remove();
          }
        }
        return {
          code: src.getText()
        };
      }
    }
  };
}

// vite-plugins/i18n-importer.mts
import { basename as basename3, relative as relative2, resolve as resolve3, extname as extname2, dirname as dirname3 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { globSync as globSync2 } from "glob";
import { Project as Project3 } from "ts-morph";
var __electron_vite_injected_import_meta_url3 = "file:///C:/DEV/YTM/vite-plugins/i18n-importer.mts";
var snakeToCamel2 = (text) => text.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
var __dirname3 = dirname3(fileURLToPath3(__electron_vite_injected_import_meta_url3));
var globalProject3 = new Project3({
  tsConfigFilePath: resolve3(__dirname3, "..", "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
  skipLoadingLibFiles: true,
  skipFileDependencyResolution: true
});
var i18nImporter = () => {
  const srcPath = resolve3(__dirname3, "..", "src");
  const plugins = globSync2(["src/i18n/resources/*.json"]).map((path) => {
    const nameWithExt = basename3(path);
    const name = nameWithExt.replace(extname2(nameWithExt), "");
    return { name, path };
  });
  const src = globalProject3.createSourceFile(
    "vm:i18n",
    (writer) => {
      for (const { name, path } of plugins) {
        const relativePath = relative2(resolve3(srcPath, ".."), path).replace(/\\/g, "/");
        writer.writeLine(`import ${snakeToCamel2(name)}Json from "./${relativePath}";`);
      }
      writer.blankLine();
      writer.writeLine("export const languageResources = {");
      for (const { name } of plugins) {
        writer.writeLine(`  "${name}": {`);
        writer.writeLine(`    translation: ${snakeToCamel2(name)}Json,`);
        writer.writeLine("  },");
      }
      writer.writeLine("};");
      writer.blankLine();
    },
    { overwrite: true }
  );
  return src.getText();
};

// electron.vite.config.mts
var __electron_vite_injected_import_meta_url4 = "file:///C:/DEV/YTM/electron.vite.config.mts";
var __dirname4 = dirname4(fileURLToPath4(__electron_vite_injected_import_meta_url4));
var resolveAlias = {
  "@": resolve4(__dirname4, "./src"),
  "@assets": resolve4(__dirname4, "./assets")
};
var electron_vite_config_default = defineConfig({
  main: defineViteConfig(({ mode }) => {
    const commonConfig = {
      experimental: {
        enableNativePlugin: true
      },
      plugins: [
        plugin_loader_default("backend"),
        viteResolve({
          "virtual:i18n": i18nImporter(),
          "virtual:plugins": pluginVirtualModuleGenerator("main")
        })
      ],
      publicDir: "assets",
      build: {
        lib: {
          entry: "src/index.ts",
          formats: ["cjs"]
        },
        outDir: "dist/main",
        commonjsOptions: {
          ignoreDynamicRequires: true
        },
        rollupOptions: {
          external: ["electron", "custom-electron-prompt", ...builtinModules],
          input: "./src/index.ts"
        }
      },
      resolve: {
        alias: resolveAlias
      }
    };
    if (mode === "development") {
      commonConfig.build.sourcemap = "inline";
      commonConfig.plugins?.push(
        Inspect({
          build: true,
          outputDir: join(__dirname4, ".vite-inspect/backend")
        })
      );
      return commonConfig;
    }
    return {
      ...commonConfig,
      build: {
        ...commonConfig.build,
        minify: true,
        cssMinify: true
      }
    };
  }),
  preload: defineViteConfig(({ mode }) => {
    const commonConfig = {
      experimental: {
        enableNativePlugin: true
      },
      plugins: [
        plugin_loader_default("preload"),
        viteResolve({
          "virtual:i18n": i18nImporter(),
          "virtual:plugins": pluginVirtualModuleGenerator("preload")
        })
      ],
      build: {
        lib: {
          entry: "src/preload.ts",
          formats: ["cjs"]
        },
        outDir: "dist/preload",
        commonjsOptions: {
          ignoreDynamicRequires: true
        },
        rollupOptions: {
          external: ["electron", "custom-electron-prompt", ...builtinModules],
          input: "./src/preload.ts"
        }
      },
      resolve: {
        alias: resolveAlias
      }
    };
    if (mode === "development") {
      commonConfig.build.sourcemap = "inline";
      commonConfig.plugins?.push(
        Inspect({
          build: true,
          outputDir: join(__dirname4, ".vite-inspect/preload")
        })
      );
      return commonConfig;
    }
    return {
      ...commonConfig,
      build: {
        ...commonConfig.build,
        minify: true,
        cssMinify: true
      }
    };
  }),
  renderer: defineViteConfig(({ mode }) => {
    const commonConfig = {
      experimental: {
        enableNativePlugin: mode !== "development"
        // Disable native plugin in development mode to avoid issues with HMR (bug in rolldown-vite)
      },
      plugins: [
        plugin_loader_default("renderer"),
        viteResolve({
          "virtual:i18n": i18nImporter(),
          "virtual:plugins": pluginVirtualModuleGenerator("renderer")
        }),
        withFilter(solidPlugin(), {
          load: { id: [/\.(tsx|jsx)$/, "/@solid-refresh"] }
        })
      ],
      root: "./src/",
      build: {
        lib: {
          entry: "src/index.html",
          formats: ["iife"],
          name: "renderer"
        },
        outDir: "dist/renderer",
        commonjsOptions: {
          ignoreDynamicRequires: true
        },
        rollupOptions: {
          external: ["electron", ...builtinModules],
          input: "./src/index.html"
        }
      },
      resolve: {
        alias: resolveAlias
      },
      server: {
        cors: {
          origin: "https://music.youtube.com"
        }
      }
    };
    if (mode === "development") {
      commonConfig.build.sourcemap = "inline";
      commonConfig.plugins?.push(
        Inspect({
          build: true,
          outputDir: join(__dirname4, ".vite-inspect/renderer")
        })
      );
      return commonConfig;
    }
    return {
      ...commonConfig,
      build: {
        ...commonConfig.build,
        minify: true,
        cssMinify: true
      }
    };
  })
});
export {
  electron_vite_config_default as default
};
