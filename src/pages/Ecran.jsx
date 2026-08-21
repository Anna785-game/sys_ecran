import { useCallback, useEffect, useRef, useState } from "react";
import { verifierVisage, enrolerVisageEcran } from "../api/api";
import { useDetectionVisage } from "../hooks/useDetectionVisage";
import { useLecteurCarte } from "../hooks/useLecteurCarte";
import { useWsEcran } from "../hooks/useWsEcran";
import CompteARebours from "../components/CompteARebours";
import CarreIdle from "../components/CarreIdle";
import "../styles/nouveautes.css";

const DUREE_AFFICHAGE_SUCCES_MS = 3000;
const DUREE_AVANT_ABANDON_ECHEC_MS = 15000;
const DUREE_FLASH_MS = 150;
const DUREE_BANNIERE_MS = 8000;
const DUREE_ENROLEMENT_TIMEOUT_MS = 90000; // abandon auto si personne ne se présente

// Modes :
//   - veille (tache null, pas d'enrôlement)
//   - vérification carte+visage (tache = { uidcarte })
//   - enrôlement secours téléphone (enrolement = { employe_id, nom })
//
// phase (partagée) : "attente" | "compte" | "traitement" | "resultat"

export default function Ecran() {
  const [tache, setTache] = useState(null); // { uidcarte } vérification
  const [enrolement, setEnrolement] = useState(null); // { employe_id, nom, candidat_id? }
  const [phase, setPhase] = useState("attente");
  const [resultat, setResultat] = useState(null);
  const [flashActif, setFlashActif] = useState(false);
  const [banniere, setBanniere] = useState(null);
  const photoRef = useRef(null);
  const timeoutAbandonRef = useRef(null);
  const bannierTimeoutRef = useRef(null);
  const enrollTimeoutRef = useRef(null);
  const audioCtxRef = useRef(null);

  const actif = tache !== null || enrolement !== null;
  const { videoRef, canvasRef, pret, visagePresent, erreur, capturerPhoto } =
    useDetectionVisage(actif);

  const surScanCarte = useCallback((uid) => {
    // Pendant un enrôlement en cours, on ignore les scans carte
    setEnrolement((enr) => {
      if (enr) return enr;
      // État propre à chaque nouveau scan
      setPhase("attente");
      setResultat(null);
      setTache({ uidcarte: uid });
      return null;
    });
  }, []);
  useLecteurCarte(surScanCarte);

  useWsEcran((payload) => {
    if (payload.event === "employe_actif" || payload.event === "carte_assignee") {
      setBanniere(
        payload.message ||
          (payload.event === "carte_assignee"
            ? "Une carte vient d'être remise."
            : "Un(e) candidat(e) a terminé son parcours.")
      );
      clearTimeout(bannierTimeoutRef.current);
      bannierTimeoutRef.current = setTimeout(
        () => setBanniere(null),
        DUREE_BANNIERE_MS
      );
    }

    if (payload.event === "scan_factice" && payload.uidcarte) {
      surScanCarte(payload.uidcarte);
    }

    // Badge porte physique (ESP32) → bannière + lancement auto de la vérif faciale
    if (payload.event === "porte_carte_ok" && payload.uidcarte) {
      setBanniere(
        payload.message ||
          `${payload.nom || "Employé"}, placez-vous devant l'écran.`
      );
      clearTimeout(bannierTimeoutRef.current);
      bannierTimeoutRef.current = setTimeout(
        () => setBanniere(null),
        DUREE_BANNIERE_MS
      );
      surScanCarte(payload.uidcarte);
    }

    // Demande d'enrôlement depuis le téléphone (caméra bloquée)
    if (payload.event === "enrolement_ecran_demande" && payload.employe_id) {
      setTache(null); // priorité à l'enrôlement
      setResultat(null);
      setPhase("attente");
      setEnrolement({
        employe_id: payload.employe_id,
        nom: payload.candidat?.nom || "le candidat",
        candidat_id: payload.candidat?.id,
      });
      clearTimeout(enrollTimeoutRef.current);
      enrollTimeoutRef.current = setTimeout(() => {
        setEnrolement(null);
        setPhase("attente");
        setResultat(null);
      }, DUREE_ENROLEMENT_TIMEOUT_MS);
    }

    // Si le visage a été enrôlé ailleurs pendant qu'on attendait, on ferme
    if (payload.event === "visage_enrole" && enrolement) {
      if (
        payload.employe_id === enrolement.employe_id ||
        payload.candidat?.id === enrolement.candidat_id
      ) {
        clearTimeout(enrollTimeoutRef.current);
        setEnrolement(null);
        setPhase("attente");
        setResultat(null);
      }
    }
  });

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

  
    // Visage détecté → démarre le compte à rebours, mais seulement après un court délai
  // pour laisser le temps d'appuyer sur « Je suis prêt » (surtout en enrôlement).
  useEffect(() => {
    if (!(tache || enrolement) || phase !== "attente" || !visagePresent) return;

    const delai = setTimeout(() => {
      setPhase((p) => (p === "attente" ? "compte" : p));
    }, 1500); // 1,5 s de marge

    return () => clearTimeout(delai);
  }, [tache, enrolement, phase, visagePresent]);

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

      if (enrolement) {
        await enrolerVisageEcran(enrolement.employe_id, photoRef.current);
        setResultat({
          succes: true,
          message: `Visage enregistré pour ${enrolement.nom}. Vous pouvez choisir votre poste sur votre téléphone.`,
        });
        clearTimeout(enrollTimeoutRef.current);
      } else {
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

  // Succès → retour veille auto ; échec → bouton Réessayer + timeout.
  useEffect(() => {
    if (phase !== "resultat" || !resultat) return;

    if (resultat.succes) {
      const id = setTimeout(() => {
        setTache(null);
        setEnrolement(null);
        setPhase("attente");
        setResultat(null);
      }, DUREE_AFFICHAGE_SUCCES_MS);
      return () => clearTimeout(id);
    }

    timeoutAbandonRef.current = setTimeout(() => {
      setTache(null);
      setEnrolement(null);
      setPhase("attente");
      setResultat(null);
    }, DUREE_AVANT_ABANDON_ECHEC_MS);
    return () => clearTimeout(timeoutAbandonRef.current);
  }, [phase, resultat]);

  function reessayer() {
    clearTimeout(timeoutAbandonRef.current);
    setResultat(null);
    setPhase("attente"); // on garde tache ou enrolement
  }

  function annulerEnrolement() {
    clearTimeout(enrollTimeoutRef.current);
    clearTimeout(timeoutAbandonRef.current);
    setEnrolement(null);
    setTache(null);
    setPhase("attente");
    setResultat(null);
  }

  if (!actif) {
    return (
      <div className="ecran-kiosque inactif">
        <CarreIdle />
        {banniere && <div className="banniere-felicitation">{banniere}</div>}
      </div>
    );
  }

  const titreAttente = enrolement
    ? `Pour ${enrolement.nom} seulement`
    : "Veuillez vous placer devant l'écran";
  const sousAttente = enrolement
    ? pret
      ? "Placez votre visage dans le cadre pour enregistrer votre identité."
      : "Activation de la caméra..."
    : pret
      ? "Placez votre visage dans le cadre."
      : "Activation de la caméra...";

  return (
    <div className={`ecran-kiosque actif ${enrolement ? "mode-enrolement" : ""}`}>
      <video ref={videoRef} muted playsInline className="video-fond" />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {flashActif && <div className="flash-capture" />}

      <div className="overlay">
        {(phase === "attente" || phase === "compte") && (
          <div
            className={`cadre-guide ${visagePresent ? "cadre-guide-ok" : ""}`}
          />
        )}

        {phase === "attente" && (
          <>
            <h1>{titreAttente}</h1>
            <p className="sous-texte-ecran">{sousAttente}</p>
            {enrolement && (
              <p className="sous-texte-ecran" style={{ opacity: 0.75, marginTop: 8 }}>
                Enrôlement demandé depuis le téléphone — carte non requise.
              </p>
            )}
            {erreur && <p className="erreur-ecran">{erreur}</p>}

            {/* Bouton de secours — style sys_user */}
            {pret && (
              <button
                type="button"
                className="bouton-reessayer"
                style={{
                  marginTop: 24,
                  padding: "14px 28px",
                  fontSize: "1.1rem",
                }}
                onClick={() => setPhase("compte")}
              >
                Je suis prêt
              </button>
            )}

            {enrolement && (
              <button
                type="button"
                className="bouton-reessayer"
                onClick={annulerEnrolement}
                style={{ marginTop: 16 }}
              >
                Annuler
              </button>
            )}
          </>
        )}

        {phase === "compte" && (
          <>
            <h1>
              {enrolement
                ? `Ne bougez plus, ${enrolement.nom}…`
                : "Ne bougez plus..."}
            </h1>
            <CompteARebours onCapture={surCapture} onTermine={surFinCompte} />
          </>
        )}

        {phase === "traitement" && (
          <h1>
            {enrolement ? "Enregistrement du visage…" : "Analyse en cours..."}
          </h1>
        )}

        {phase === "resultat" && (
          <>
            <h1
              className={
                resultat.succes ? "resultat-succes" : "resultat-echec"
              }
            >
              {resultat.message}
            </h1>
            {!resultat.succes && (
              <button
                type="button"
                className="bouton-reessayer"
                onClick={reessayer}
              >
                Réessayer
              </button>
            )}
          </>
        )}
      </div>

      {/* Bannière aussi visible pendant une vérif (badge porte) */}
      {banniere && <div className="banniere-felicitation">{banniere}</div>}
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
  if (/401|403|token|autoris|secret/i.test(brut)) {
    return "Configuration kiosque incomplète (secret écran). Contactez la régie.";
  }
  return "La photo n'a pas pu être analysée (lumière, flou...). Réessayez.";
}