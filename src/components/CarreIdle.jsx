// Écran de veille : rien n'est actif, personne n'a rien à faire ici, on
// affiche juste un repère visuel discret (façon carré de calage de QR code)
// pour indiquer où se placer plus tard.
export default function CarreIdle() {
  return (
    <div className="carre-idle">
      <div className="carre-idle-coin haut-gauche" />
      <div className="carre-idle-coin haut-droit" />
      <div className="carre-idle-coin bas-gauche" />
      <div className="carre-idle-coin bas-droit" />
    </div>
  );
}
