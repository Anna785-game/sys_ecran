// --- Backend réel fastapi_pointage (Render) --------------------------------
const PRESENCE_API_BASE =
  import.meta.env.VITE_PRESENCE_API_BASE || "https://presence-1s80.onrender.com";

// --- face_server local (Cloudflare) — optionnel si tu encodes encore côté front
// À changer à chaque nouveau tunnel (ou via .env VITE_FACE_API_BASE)
const FACE_API_BASE =
  import.meta.env.VITE_FACE_API_BASE || "https://XXXX.trycloudflare.com";
const FACE_SECRET = import.meta.env.VITE_FACE_SECRET || "";

// Secret statique dédié à l'écran (n'expire jamais, contrairement à un JWT
// Supabase). Doit correspondre à ECRAN_SHARED_SECRET côté backend (Render).
// Protège /candidats/ecran/tache-active et /api/biometrie/enroll.
const ECRAN_SECRET = import.meta.env.VITE_ECRAN_SECRET || "";

export const api = {
  /**
   * GET /candidats/ecran/tache-active, protégé par X-Ecran-Secret.
   * Remplace l'ancien polling sur /candidats (qui exigeait un JWT admin
   * Supabase, expirant au bout d'1h — inadapté à un écran qui doit tourner
   * en continu pendant toute l'expo).
   */
  tacheActive: async () => {
    const res = await fetch(`${PRESENCE_API_BASE}/candidats/ecran/tache-active`, {
      headers: { "X-Ecran-Secret": ECRAN_SECRET },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const erreur = new Error(data?.detail || `Erreur ${res.status}`);
      erreur.status = res.status;
      throw erreur;
    }
    return data; // { candidatId, employeId, nom } ou null
  },

  /**
   * Enrôlement : photo → backend.
   * POST /api/biometrie/enroll/{employe_id}, protégé par X-Ecran-Secret
   * (plus par require_admin — évite l'expiration du JWT en pleine expo).
   * Le serveur appelle face_server, stocke l'encoding, tire la roulette.
   */
  enrollVisage: async (employeId, blobPhoto) => {
    const form = new FormData();
    form.append("photo", blobPhoto, "photo.jpg");

    const res = await fetch(
      `${PRESENCE_API_BASE}/api/biometrie/enroll/${employeId}`,
      {
        method: "POST",
        headers: { "X-Ecran-Secret": ECRAN_SECRET },
        body: form,
      }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const erreur = new Error(
        data?.detail || data?.erreur || `Erreur ${res.status}`
      );
      erreur.status = res.status;
      throw erreur;
    }
    return data;
  },
};

/**
 * Encode via face_server (tunnel). Conservé au cas où, mais le flux
 * métier (enrollVisage) n'en a plus besoin.
 */
export async function encoderVisage(blobPhoto) {
  const form = new FormData();
  form.append("photo", blobPhoto, "photo.jpg");

  const res = await fetch(`${FACE_API_BASE}/encode`, {
    method: "POST",
    headers: { "X-Face-Secret": FACE_SECRET },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const erreur = new Error(data?.detail || "Échec de l'analyse du visage");
    erreur.status = res.status;
    throw erreur;
  }
  return data.encoding;
}

/**
 * Entrée / sortie carte + visage.
 * POST /api/biometrie/verify  (public)
 */
export async function verifierVisage(uidcarte, blobPhoto, seuil) {
  const form = new FormData();
  form.append("uidcarte", uidcarte);
  form.append("photo", blobPhoto, "photo.jpg");
  if (seuil != null) form.append("seuil", String(seuil));

  const res = await fetch(`${PRESENCE_API_BASE}/api/biometrie/verify`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const erreur = new Error(data?.detail || `Erreur ${res.status}`);
    erreur.status = res.status;
    throw erreur;
  }
  return data; // { result: "AUTHORIZED" | "DENIED", ... }
}

export { PRESENCE_API_BASE, FACE_API_BASE };