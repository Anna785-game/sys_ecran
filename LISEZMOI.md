# front_ecran

Nouvel écran physique (ton téléphone), posé face au visiteur. Il ne fait
qu'une chose : décider quand la caméra est active, et prendre la photo du
visage à sa place. Le candidat, lui, n'utilise jamais sa propre caméra.

## Comportement

- **Veille** : aucune caméra ouverte, juste un repère visuel discret (carré
  façon coin de QR code). N'importe qui peut se tenir devant sans rien
  déclencher.
- **Enrôlement** : dès que le mock-api signale qu'un candidat vient d'être
  sélectionné (`GET /ecran/tache-active`), l'écran affiche « Veuillez
  enregistrer votre visage, {nom} », active sa caméra, détecte un visage,
  puis lance un compte à rebours de 5s. La photo est prise à 2s (donc
  pendant le décompte, pas à la toute fin), envoyée au `face_server` pour
  encodage, puis le résultat est renvoyé au mock-api. Le téléphone du
  candidat (front_user) affichera la confirmation tout seul via son
  polling existant — rien à faire côté front_ecran pour ça.
- **Vérification par carte** : un lecteur RFID branché sur l'écran (mode
  clavier / HID) déclenche le même scénario (détection, compte à rebours,
  photo à 2s), mais la photo est envoyée avec l'UID de la carte à
  `POST /api/biometrie/verify` sur le backend fastapi_pointage réel, qui
  répond directement AUTHORIZED/DENIED.

## À prévoir côté serveur

- `GET /ecran/tache-active` sur le mock-api (`API_BASE`) : renvoie `null`
  ou `{ candidatId, nom }`. N'existait pas encore dans les fichiers fournis
  — à ajouter.
- L'endpoint `/api/biometrie/verify` existe déjà côté fastapi_pointage
  (`app/routers/biometrie.py`), utilisé tel quel.

## Variables d'environnement (`.env`)

```
VITE_API_BASE=http://localhost:4000
VITE_FACE_API_BASE=http://localhost:8000
VITE_FACE_SECRET=...
VITE_PRESENCE_API_BASE=http://localhost:8001
```

## Limite connue

La détection de visage utilise l'API native `FaceDetector` quand le
navigateur la supporte (Chrome/Android), sinon un repli approximatif par
stabilité d'image (voir `src/hooks/useDetectionVisage.js`). Si ce n'est pas
assez fiable en conditions réelles, remplace le bloc de repli par une vraie
lib (face-api.js, mediapipe...) — l'interface du hook ne change pas pour le
reste de l'appli.
