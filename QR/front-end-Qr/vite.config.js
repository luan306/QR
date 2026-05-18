// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     proxy: {
//       "/api": {
//         target: "https://192.168.88.131:3000",
//         changeOrigin: true,
//         secure: false,
//       },
//       "/logout": {
//         target: "https://192.168.88.131:3000",
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
// });

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  server: {
    watch: {
      usePolling: true,   // fix HMR khi dùng WSL / network drive / Docker
      interval: 300,      // poll mỗi 300ms (có thể tăng nếu tốn CPU)
    },
    proxy: {
      "/api": {
        target: "https://192.168.169.1:3000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost",
      },
      "/logout": {
        target: "https://192.168.169.1:3000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost",
      },
      "/layouts": {
        target: "https://192.168.169.1:3000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost",
      },
      "/socket.io": {
        target: "https://192.168.169.1:3000",
        changeOrigin: true,
        secure: false,
        ws: true,
        cookieDomainRewrite: "localhost",
      },
    },
  },
});