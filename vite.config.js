import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // HTTPS est indispensable pour getUserMedia() sur un téléphone si
    // l'accès ne se fait pas via localhost (Chrome/Safari bloquent la
    // caméra en HTTP dès qu'on sort de localhost). Ajoute ton propre
    // certificat local si tu testes depuis un autre appareil que le PC
    // qui sert le site, ou passe par le même tunnel que le face_server.
  },
});
