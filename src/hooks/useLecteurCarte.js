import { useEffect, useRef } from "react";

// La plupart des lecteurs RFID USB se comportent, une fois branchés, comme
// un clavier : ils "tapent" très vite l'UID de la carte puis Entrée. On
// distingue cette frappe automatique d'une frappe humaine par sa vitesse
// (délai entre deux touches quasi nul).
const DELAI_MAX_ENTRE_TOUCHES_MS = 50;
const LONGUEUR_MIN_UID = 4;

export function useLecteurCarte(onScan) {
  const tampon = useRef("");
  const dernierTop = useRef(0);

  useEffect(() => {
    function surTouche(e) {
      const maintenant = Date.now();
      if (maintenant - dernierTop.current > DELAI_MAX_ENTRE_TOUCHES_MS) {
        tampon.current = "";
      }
      dernierTop.current = maintenant;

      if (e.key === "Enter") {
        if (tampon.current.length >= LONGUEUR_MIN_UID) {
          onScan(tampon.current);
        }
        tampon.current = "";
        return;
      }
      if (e.key.length === 1) {
        tampon.current += e.key;
      }
    }

    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onScan]);
}
