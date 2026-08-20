// --- Backend réel fastapi_pointage (Render) --------------------------------
const PRESENCE_API_BASE =
  import.meta.env.VITE_PRESENCE_API_BASE || "https://presence-1s80.onrender.com";

// --- face_server local (Cloudflare) — optionnel si tu encodes encore côté front
const FACE_API_BASE =
  import.meta.env.VITE_FACE_API_BASE || "https://XXXX.trycloudflare.com";
const FACE_SECRET = import.meta.env.VITE_FACE_SECRET || "";

// Secret écran (WebSocket bannières). Doit correspondre à ECRAN_SHARED_SECRET.
const ECRAN_SECRET = import.meta.env.VITE_ECRAN_SECRET || "";

/**
 * URL du websocket écran (mêmes événements que /ws/admin), authentifié
 * par le secret écran. Sert à afficher une bannière quand un candidat
 * choisit son poste ou reçoit sa carte côté admin.
 */
export function wsEcranUrl() {
  const httpBase = PRESENCE_API_BASE.replace(/\/+$/, "");
  const wsBase = httpBase.replace(/^http/i, (m) =>
    m.toLowerCase() === "https" ? "wss" : "ws"
  );
  return `${wsBase}/ws/ecran?secret=${encodeURIComponent(ECRAN_SECRET)}`;
}

/**
 * Encode via face_server (tunnel). Conservé au cas où.
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