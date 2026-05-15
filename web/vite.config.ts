import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [vue(), basicSsl()],
  server: {
    port: 5180,
    host: "0.0.0.0",
    https: true,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
