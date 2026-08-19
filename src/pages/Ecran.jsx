import { useCallback, useEffect, useRef, useState } from "react";
import { api, verifierVisage } from "../api/api";
import { useDetectionVisage } from "../hooks/useDetectionVisage";
import { useLecteurCarte } from "../hooks/useLecteurCarte";
import CompteARebours from "../components/CompteARebours";
import CarreIdle from "../components/CarreIdle";

const INTERVALLE_POLL_MS = 2000;
const DUREE_AFFICHAGE_SUCCES_MS = 3000;
const DUREE_AVANT_ABANDON_ECHEC_MS = 15000;
const DUREE_FLASH_MS = 150;

// phase : "attente" | "compte" | "traitement" | "resultat"
export default function Ecran() {
  // enrolement : { mode, candidatId, employeId, nom }
  // verification : { mode, uidcarte }
  const [tache, setTache] = useState(null);
  const [phase, setPhase] = useState("attente");
  const [resultat, setResultat] = useState(null);
  const [flashActif, setFlashActif] = useState(false);
  const photoRef = useRef(null);
  const timeoutAbandonRef = useRef(null);
  const audioCtxRef = useRef(null);

  const actif = tache !== null;
  const { videoRef, canvasRef, pret, visagePresent, erreur, capturerPhoto } =
    useDetectionVisage(actif);

  // AudioContext créé une fois quand l'écran devient actif (évite les
  // blocages autoplay et la recréation à chaque capture).
  useEffect(() => {
    if (!actif) return;
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    return () => {
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, [actif]);

  function jouerSonCapture() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Flash visuel suffisant si Web Audio indisponible.
    }
  }

  // Polling : y a-t-il un candidat actif sans poste (en attente d'enrôlement) ?
  // Coupé tant qu'une tâche est déjà en cours.
  useEffect(() => {
    if (tache) return;
    let annule = false;

    async function verifier() {
      try {
        const t = await api.tacheActive();
        if (!annule && t) {
          setTache({
            mode: "enrolement",
            candidatId: t.candidatId,
            employeId: t.employeId,
            nom: t.nom,
          });
          setPhase("attente");
        }
      } catch {
        // Serveur injoignable : l'écran reste en veille.
      }
    }

    verifier();
    const id = setInterval(verifier, INTERVALLE_POLL_MS);
    return () => {
      annule = true;
      clearInterval(id);
    };
  }, [tache]);

  // Scan carte RFID → mode vérification (sauf si une tâche tourne déjà).
  const surScanCarte = useCallback((uid) => {
    setTache((actuelle) => actuelle ?? { mode: "verification", uidcarte: uid });
  }, []);
  useLecteurCarte(surScanCarte);

  // Visage détecté dans le cadre → démarre le compte à rebours.
  useEffect(() => {
    if (actif && phase === "attente" && visagePresent) {
      setPhase("compte");
    }
  }, [actif, phase, visagePresent]);

  async function surCapture() {
    setFlashActif(true);
    jouerSonCapture();
    setTimeout(() => setFlashActif(false), DUREE_FLASH_MS);

    try {
      photoRef.current = await capturerPhoto();
    } catch {
      photoRef.current = null;
    }
  }

  async function surFinCompte() {
    setPhase("traitement");
    try {
      if (!photoRef.current) {
        throw new Error("Aucune photo n'a pu être prise, réessayez.");
      }

      if (tache.mode === "enrolement") {
        // Photo → backend /api/biometrie/enroll/{employe_id}
        // (le serveur appelle face_server, stocke l'encoding, tire la roulette)
        if (!tache.employeId) {
          throw new Error("Aucun employé lié à ce candidat.");
        }
        await api.enrollVisage(tache.employeId, photoRef.current);
        setResultat({ succes: true, message: "Visage enregistré avec succès." });
      } else {
        // Carte + visage → /api/biometrie/verify
        const reponse = await verifierVisage(tache.uidcarte, photoRef.current);
        const autorise = reponse.result === "AUTHORIZED";
        setResultat({
          succes: autorise,
          message: autorise
            ? `Bienvenue ${reponse.nom} — ${
                reponse.action === "entree" ? "entrée" : "sortie"
              } enregistrée.`
            : "Visage non reconnu.",
        });
      }
    } catch (e) {
      setResultat({ succes: false, message: messageErreurLisible(e) });
    } finally {
      photoRef.current = null;
      setPhase("resultat");
    }
  }

  // Succès → retour veille auto ; échec → bouton Réessayer + timeout de sécurité.
  useEffect(() => {
    if (phase !== "resultat" || !resultat) return;

    if (resultat.succes) {
      const id = setTimeout(() => {
        setTache(null);
        setPhase("attente");
        setResultat(null);
      }, DUREE_AFFICHAGE_SUCCES_MS);
      return () => clearTimeout(id);
    }

    timeoutAbandonRef.current = setTimeout(() => {
      setTache(null);
      setPhase("attente");
      setResultat(null);
    }, DUREE_AVANT_ABANDON_ECHEC_MS);
    return () => clearTimeout(timeoutAbandonRef.current);
  }, [phase, resultat]);

  function reessayer() {
    clearTimeout(timeoutAbandonRef.current);
    setResultat(null);
    setPhase("attente"); // on garde `tache` (pas besoin de rescanner / re-sélectionner)
  }

  if (!actif) {
    return (
      <div className="ecran-kiosque inactif">
        <CarreIdle />
      </div>
    );
  }

  return (
    <div className="ecran-kiosque actif">
      <video ref={videoRef} muted playsInline className="video-fond" />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {flashActif && <div className="flash-capture" />}

      <div className="overlay">
        {(phase === "attente" || phase === "compte") && (
          <div className={`cadre-guide ${visagePresent ? "cadre-guide-ok" : ""}`} />
        )}

        {phase === "attente" && (
          <>
            <h1>
              {tache.mode === "enrolement"
                ? `Veuillez enregistrer votre visage, ${tache.nom}`
                : "Veuillez vous placer devant l'écran"}
            </h1>
            <p className="sous-texte-ecran">
              {pret ? "Placez votre visage dans le cadre." : "Activation de la caméra..."}
            </p>
            {erreur && <p className="erreur-ecran">{erreur}</p>}
          </>
        )}

        {phase === "compte" && (
          <>
            <h1>Ne bougez plus...</h1>
            <CompteARebours onCapture={surCapture} onTermine={surFinCompte} />
          </>
        )}

        {phase === "traitement" && <h1>Analyse en cours...</h1>}

        {phase === "resultat" && (
          <>
            <h1 className={resultat.succes ? "resultat-succes" : "resultat-echec"}>
              {resultat.message}
            </h1>
            {!resultat.succes && (
              <button type="button" className="bouton-reessayer" onClick={reessayer}>
                Réessayer
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function messageErreurLisible(e) {
  const brut = e?.message || "";
  if (/plusieurs visages/i.test(brut)) {
    return "Plusieurs personnes ont été détectées dans le cadre. Assurez-vous d'être seul(e) devant l'écran.";
  }
  if (/aucun visage/i.test(brut)) {
    return "Aucun visage détecté. Rapprochez-vous et centrez votre visage.";
  }
  if (/503|indisponible|hors ligne/i.test(brut)) {
    return "Service de reconnaissance indisponible. Réessayez dans un instant.";
  }
  if (/401|403|token|autoris/i.test(brut)) {
    return "Configuration kiosque incomplète (token admin). Contactez la régie.";
  }
  return "La photo n'a pas pu être analysée (lumière, flou...). Réessayez.";
}