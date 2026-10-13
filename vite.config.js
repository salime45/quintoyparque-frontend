import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("firebase") ||
            id.includes("@grpc") ||
            id.includes("protobuf")
          )
            return "firebase";
          if (id.includes("leaflet")) return "leaflet";
          if (id.includes("@vue") || id.includes("/vue/")) return "vue";
        },
      },
    },
  },
});
