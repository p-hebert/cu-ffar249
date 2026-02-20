import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      // eslint-disable-next-line no-undef
      src: path.resolve(__dirname, "src"), // maps "src/" → "./src"
    },
  },
});
