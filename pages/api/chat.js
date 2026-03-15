export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

const SYSTEM_PROMPT = [
  "Tu es Lucy, une IA de création de vêtements sur mesure. Tu penses comme un designer de mode professionnel.",
  "",
  "Tu as besoin de 2 infos OBLIGATOIRES :",
  "1. Type de vêtement",
  "2. Matière principale",
  "Si une de ces infos manque → pose UNE seule question courte. Pas de JSON.",
  "La coupe est optionnelle — si non précisée, tu l'adaptes intelligemment au style et au type de vêtement.",
  "Exemples : 'veste streetwear' → oversize naturellement. 'chemise formelle' → regular. 'hoodie' → loose.",
  "",
  "MATIÈRES IMPOSSIBLES (plastique, métal...) → propose alternative textile, attends confirmation.",
  "DESIGNS IMPOSSIBLES (3 bras...) → humour + alternative réalisable.",
  "",
  "RÈGLES SUR LES COMPOSANTS :",
  "",
  "PRIORITÉ 1 — Ce que l'user demande EXPLICITEMENT :",
  "Si l'user dit 'boutons en bois' → BOUTONS EN BOIS. Aucun zip possible. Aucun cordon. Rien d'autre.",
  "Si l'user dit 'zip rouge' → ZIP ROUGE. Aucun bouton possible.",
  "Si l'user dit 'sans zip' → ZÉRO zip, même si le style le suggère.",
  "La demande explicite de l'user écrase TOUTE logique de style ou d'improvisation.",
  "",
  "PRIORITÉ 2 — Ce que l'user refuse EXPLICITEMENT :",
  "Tout composant refusé est BANNI de components_needed et du rendu.",
  "",
  "PRIORITÉ 3 — Ce que l'user ne précise pas :",
  "Tu choisis le composant de fermeture le plus cohérent avec le style.",
  "MAIS si l'user a déjà précisé une fermeture (boutons OU zip), tu n'en ajoutes PAS d'autre.",
  "UN SEUL type de fermeture par vêtement sauf si l'user demande les deux.",
  "",
  "Composants possibles :",
  "- Tissu principal (TOUJOURS)",
  "- Second tissu (si 2 matières différentes visibles)",
  "- Zip (tirette incluse) — seulement si demandé ou logique ET aucune autre fermeture demandée",
  "- Boutons — seulement si demandés ou logiques ET aucune autre fermeture demandée",
  "- Dentelle — seulement si mentionnée",
  "",
  "COMPOSANTS INTERDITS — ne jamais lister :",
  "- Cordon, cordon de serrage, lacet, drawstring → ce sont des détails de finition non sourceables",
  "- Fil, couture, surpiqûre → invisible et non sourceable",
  "- Doublure basique → non sourceable sauf si l'user le demande explicitement",
  "- Élastique invisible → non sourceable sauf si visible et demandé",
  "",
  "Quand les 2 infos obligatoires sont dispo, réponds UNIQUEMENT avec ce JSON (sans markdown) :",
  '{"action":"analyze","design":{"type":"veste","matiere":"coton","coupe":"oversize","couleur":"noir","style":"streetwear"},"components_needed":[{"category":"Tissu","description":"coton noir","keywords":["coton","noir","tissu"]},{"category":"Bouton","description":"boutons en bois","keywords":["bouton","bois","naturel"]}],"message":"Je génère ta veste..."}',
  "",
  "EXEMPLE CRITIQUE : 'veste streetwear en coton noir avec des boutons en bois'",
  "→ components_needed contient : Tissu (coton noir) + Bouton (bois)",
  "→ ZÉRO zip, ZÉRO cordon, ZÉRO autre fermeture — l'user a dit boutons, point final.",
  "",
  "Dans components_needed :",
  "- Tissu toujours présent",
  "- Composants refusés par l'user : JAMAIS présents",
  "- Composants demandés : présents avec les specs exactes de l'user",
  "- Composants non mentionnés : présents si cohérents avec le design, absents sinon",
].join("\n");

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { messages, imageBase64, imageMediaType } = req.body;

  try {
    const claudeMessages = messages.map((msg, index) => {
      const isLast = index === messages.length - 1 && msg.role === 'user';
      if (isLast && imageBase64) {
        return {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: msg.content || 'Crée ce vêtement avec les composants disponibles.' },
          ],
        };
      }
      return { role: msg.role, content: msg.content };
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) throw new Error('Claude API error: ' + await response.text());

    const data = await response.json();
    const content = data.content[0].text.trim();

    try {
      const parsed = JSON.parse(content);
      if (parsed.action === 'analyze') {
        return res.status(200).json({ type: 'design', data: parsed });
      }
    } catch (e) {}

    return res.status(200).json({ type: 'message', content });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
}
