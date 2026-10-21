// Lets `node --test` load the app's extensionless TypeScript imports.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND" || !/^\.\.?\//.test(specifier))
        throw error;
      for (const extension of [".ts", ".js"]) {
        try {
          return next(specifier + extension, context);
        } catch {}
      }
      throw error;
    }
  },
});
