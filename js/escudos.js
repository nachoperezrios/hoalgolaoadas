// Escudos originales y ficticios para el juego (no reproducen emblemas oficiales).
// Cada jugador puede reemplazarlos por una imagen propia desde la pestaña de la institución.

const ESCUDO = "M60 6 L108 20 V62 C108 96 86 118 60 130 C34 118 12 96 12 62 V20 Z";

export const ESCUDOS = {
  pfa: `<svg viewBox="0 0 120 136" role="img" aria-label="Escudo ficticio de la PFA">
    <path d="${ESCUDO}" fill="#1d3b5c" stroke="#c9a54a" stroke-width="4"/>
    <path d="M60 14 L100 26 V62 C100 90 82 110 60 121 C38 110 20 90 20 62 V26 Z" fill="none" stroke="#7fb2dd" stroke-width="1.5"/>
    <rect x="20" y="50" width="80" height="16" fill="#7fb2dd"/>
    <path d="M60 28 l5.5 11.5 12.5 1.5 -9.3 8.6 2.5 12.4 -11.2 -6.2 -11.2 6.2 2.5 -12.4 -9.3 -8.6 12.5 -1.5Z" fill="#c9a54a"/>
    <path d="M34 104 q8 -22 26 -28 M86 104 q-8 -22 -26 -28" fill="none" stroke="#c9a54a" stroke-width="3" stroke-linecap="round"/>
    <text x="60" y="96" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="17" fill="#ffffff" letter-spacing="2">PFA</text>
  </svg>`,
  side: `<svg viewBox="0 0 120 136" role="img" aria-label="Escudo ficticio de la SIDE">
    <path d="${ESCUDO}" fill="#20252c" stroke="#9aa6b2" stroke-width="4"/>
    <circle cx="60" cy="58" r="28" fill="none" stroke="#9aa6b2" stroke-width="2"/>
    <circle cx="60" cy="58" r="19" fill="none" stroke="#5f6c78" stroke-width="1.2"/>
    <path d="M60 26 L65 53 L92 58 L65 63 L60 90 L55 63 L28 58 L55 53Z" fill="#d6dde3"/>
    <circle cx="60" cy="58" r="4.5" fill="#20252c"/>
    <text x="60" y="112" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="16" fill="#d6dde3" letter-spacing="3">SIDE</text>
  </svg>`,
  afi: `<svg viewBox="0 0 120 136" role="img" aria-label="Escudo ficticio de la AFI">
    <path d="${ESCUDO}" fill="#2c4a3a" stroke="#c9a54a" stroke-width="4"/>
    <path d="M36 88 V50 h8 v-8 h8 v8 h16 v-8 h8 v8 h8 V88 Z" fill="#e8e2cf"/>
    <path d="M52 88 V70 a8 8 0 0 1 16 0 V88 Z" fill="#2c4a3a"/>
    <rect x="57" y="30" width="6" height="12" fill="#c9a54a"/>
    <text x="60" y="112" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="16" fill="#e8e2cf" letter-spacing="3">AFI</text>
  </svg>`,
};

// Reduce una imagen subida a un tamaño razonable para guardarla en la partida.
export function imagenADataURL(archivo, max = 220) {
  return new Promise((ok, mal) => {
    if (!archivo.type.startsWith("image/")) return mal(new Error("El archivo tiene que ser una imagen"));
    const lector = new FileReader();
    lector.onerror = () => mal(new Error("No se pudo leer la imagen"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => mal(new Error("No se pudo abrir la imagen"));
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let url = c.toDataURL("image/webp", 0.85);
        if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/png");
        if (url.length > 300000) return mal(new Error("La imagen es demasiado pesada aun reducida; probá con otra"));
        ok(url);
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}
