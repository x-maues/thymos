import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    {
      name: 'demo-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/run-demo' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
              fs.writeFileSync(path.resolve(process.cwd(), 'frontend/public/draft.json'), body);
              exec("npm run demo", { cwd: process.cwd() }, (error, stdout, stderr) => {
                 if (error) console.error("Demo failed:", error);
                 else console.log("Demo succeeded!");
              });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'started' }));
            });
            return;
          }
          next();
        });
      }
    }
  ],
  root: "frontend",
  server: {
    port: 4173
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
