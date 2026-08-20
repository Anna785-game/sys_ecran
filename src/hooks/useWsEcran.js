import { useEffect, useRef } from "react";
import { wsEcranUrl } from "../api/api";

const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 15000;

// Connexion websocket dédiée à l'écran (voir /ws/ecran côté backend),
// avec reconnexion automatique. `onMessage` reçoit chaque événement
// (poste_choisi, employe_actif, carte_assignee, ...) tel que broadcasté par
// le backend ; c'est à l'appelant de filtrer ce qui l'intéresse.
export function useWsEcran(onMessage) {
  const socketRef = useRef(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef(null);
  const fermeParUser = useRef(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    fermeParUser.current = false;

    function connecter() {
      const socket = new WebSocket(wsEcranUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttempt.current = 0;
      };

      socket.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data);
          onMessageRef.current?.(payload);
        } catch {
          // message non-JSON ignoré
        }
      };

      socket.onclose = (ev) => {
        if (fermeParUser.current || ev.code === 4403) return;
        const delai = Math.min(
          RECONNECT_BASE_MS * 2 ** reconnectAttempt.current,
          RECONNECT_MAX_MS
        );
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connecter, delai);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connecter();

    return () => {
      fermeParUser.current = true;
      clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
    };
  }, []);
}
