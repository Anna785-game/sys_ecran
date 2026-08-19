import { useEffect, useRef, useState } from "react";

const DUREE_MS = 5000;
// La photo est prise pendant le compte à rebours, mais pas tout à la fin :
// à 2s écoulées, il reste encore 3s à décompter à l'écran.
const DELAI_CAPTURE_MS = 2000;

export default function CompteARebours({ onCapture, onTermine }) {
  const [restant, setRestant] = useState(Math.ceil(DUREE_MS / 1000));
  const dejaCapture = useRef(false);
  const termine = useRef(false);

  useEffect(() => {
    const debut = Date.now();
    const intervalle = setInterval(() => {
      const ecoule = Date.now() - debut;
      setRestant(Math.max(0, Math.ceil((DUREE_MS - ecoule) / 1000)));

      if (!dejaCapture.current && ecoule >= DELAI_CAPTURE_MS) {
        dejaCapture.current = true;
        onCapture();
      }
      if (!termine.current && ecoule >= DUREE_MS) {
        termine.current = true;
        clearInterval(intervalle);
        onTermine();
      }
    }, 100);
    return () => clearInterval(intervalle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="compte-a-rebours">
      <span>{restant}</span>
    </div>
  );
}
