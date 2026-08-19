// --- Backend réel fastapi_pointage (Render) --------------------------------
const PRESENCE_API_BASE =
  import.meta.env.VITE_PRESENCE_API_BASE || "https://presence-1s80.onrender.com";

// --- face_server local (Cloudflare) — optionnel si tu encodes encore côté front
// À changer à chaque nouveau tunnel (ou via .env VITE_FACE_API_BASE)
const FACE_API_BASE =
  import.meta.env.VITE_FACE_API_BASE || "https://XXXX.trycloudflare.com";
const FACE_SECRET = import.meta.env.VITE_FACE_SECRET || "";

// JWT admin Supabase pour les routes require_admin (enroll + liste candidats)
const SERVICE_TOKEN = import.meta.env.VITE_SERVICE_TOKEN || "";

async function appelJson(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (SERVICE_TOKEN && !headers.Authorization) {
    headers.Authorization = `Bearer ${SERVICE_TOKEN}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const erreur = new Error(
      data?.erreur || data?.detail || `Erreur ${res.status}`
    );
    erreur.status = res.status;
    erreur.data = data;
    throw erreur;
  }
  return data;
}

export const api = {
  /**
   * Remplace l'ancien GET /ecran/tache-active (inexistant côté backend).
   * Cherche un candidat statut === "actif" sans poste_attribue
   * (= en attente d'enrôlement visage après acceptation admin).
   * Nécessite VITE_SERVICE_TOKEN (JWT admin).
   */
  tacheActive: async () => {
    const liste = await appelJson(`${PRESENCE_API_BASE}/candidats`);
    const actif = (liste || []).find(
      (c) => c.statut === "actif" && c.employe_id && !c.poste_attribue
    );
    if (!actif) return null;
    return {
      candidatId: actif.id,
      employeId: actif.employe_id,
      nom: actif.nom,
    };
  },

  /**
   * Enrôlement : photo → backend.
   * POST /api/biometrie/enroll/{employe_id}  (require_admin)
   * Le serveur appelle face_server, stocke l'encoding, tire la roulette.
   */
  enrollVisage: async (employeId, blobPhoto) => {
    const form = new FormData();
    form.append("photo", blobPhoto, "photo.jpg");

    const res = await fetch(
      `${PRESENCE_API_BASE}/api/biometrie/enroll/${employeId}`,
      {
        method: "POST",
        headers: SERVICE_TOKEN
          ? { Authorization: `Bearer ${SERVICE_TOKEN}` }
          : {},
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