import { useEffect, useRef, useState } from "react";

const INTERVALLE_DETECTION_MS = 350;

// Ouvre la caméra de l'écran (celle qui fait face au visiteur) tant que
// `actif` est vrai, et signale si un visage semble présent dans le cadre.
//
// Utilise l'API native FaceDetector quand le navigateur la supporte (Chrome
// desktop/Android). À défaut, retombe sur une détection de présence
// approximative par stabilité de l'image (un sujet qui se tient à peu près
// immobile devant l'écran). Ce repli est volontairement simple : si la
// fiabilité pose problème en conditions réelles, le mieux est de brancher
// une vraie lib de détection (ex. face-api.js / mediapipe) à la place du
// bloc "repli" ci-dessous, l'interface du hook ne change pas.
export function useDetectionVisage(actif) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [pret, setPret] = useState(false);
  const [visagePresent, setVisagePresent] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Ouverture / fermeture de la caméra
  useEffect(() => {
    if (!actif) {
      setPret(false);
      setVisagePresent(false);
      setErreur(null);
      return;
    }

    let flux;
    let annule = false;

    async function demarrer() {
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user", // plus de { exact: "user" } → beaucoup plus fiable
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (annule) {
          flux.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = flux;
          await videoRef.current.play();
          setPret(true);
          setErreur(null);
        }
      } catch (e) {
        setErreur(
          "Impossible d'accéder à la caméra frontale de l'écran. Vérifiez les autorisations."
        );
        setPret(false);
      }
    }
    demarrer();

    return () => {
      annule = true;
      flux?.getTracks().forEach((t) => t.stop());
    };
  }, [actif]);

  // Boucle de détection
  useEffect(() => {
    if (!actif || !pret) return;

    let annule = false;
    let timeoutId;
    const detecteurNatif =
      "FaceDetector" in window
        ? new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
        : null;
    let derniereImage = null;

    async function boucle() {
      if (annule) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        try {
          if (detecteurNatif) {
            const visages = await detecteurNatif.detect(video);
            if (!annule) setVisagePresent(visages.length === 1);
          } else {
            canvas.width = 48;
            canvas.height = 48;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, 48, 48);
            const image = ctx.getImageData(0, 0, 48, 48).data;

            if (derniereImage) {
              let diff = 0;
              for (let i = 0; i < image.length; i += 4) {
                diff += Math.abs(image[i] - derniereImage[i]);
              }
              // Seuils un peu plus souples
              const present = diff > 8000 && diff < 220000;
              if (!annule) setVisagePresent(present);
            }
            derniereImage = image;
          }
        } catch {
          // on ignore une erreur ponctuelle de détection et on réessaie
        }
      }
      timeoutId = setTimeout(boucle, INTERVALLE_DETECTION_MS);
    }
    boucle();

    return () => {
      annule = true;
      clearTimeout(timeoutId);
    };
  }, [actif, pret]);

  function capturerPhoto() {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  }

  return { videoRef, canvasRef, pret, visagePresent, erreur, capturerPhoto };
}