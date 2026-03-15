export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

// ── ÉTAPE 1 : Analyser le prompt et extraire le design ────────────────────────
// Lucy réfléchit comme un designer de mode + une usine textile
// Elle identifie TOUS les composants nécessaires pour produire le vêtement

const ANALYSIS_PROMPT = [
  "Tu es Lucy, une IA de création de vêtements sur mesure. Tu penses comme un designer de mode ET comme une usine textile.",
  "Tu travailles EXCLUSIVEMENT avec les composants disponibles dans une base Airtable.",
  "",
  "ÉTAPE 1 — ANALYSE DU PROMPT OU DE L'IMAGE",
  "Identifie les 3 infos obligatoires :",
  "1. Type de vêtement (veste, chemise, pantalon, t-shirt, robe, hoodie, manteau, short...)",
  "2. Matière principale",
  "3. Coupe (oversize, regular, ajusté, loose, cropped...)",
  "",
  "Si une info manque → pose UNE seule question courte. Pas de JSON encore.",
  "Si l'image est fournie → extrais les 3 infos directement depuis l'image.",
  "",
  "RÈGLES ABSOLUES :",
  "- Si matière impossible (plastique, métal, verre...) → propose une alternative textile, attends confirmation",
  "- Si design impossible à porter (3 bras, 10m de long...) → réponds avec humour et propose quelque chose de réalisable",
  "",
  "ÉTAPE 2 — QUAND LES 3 INFOS SONT DISPONIBLES",
  "Réfléchis comme un vrai designer : liste TOUS les composants nécessaires pour produire ce vêtement.",
  "Rien ne doit être laissé au hasard. Chaque élément visible sur le vêtement doit être listé.",
  "",
  "Exemples de composants selon le type :",
  "Veste : tissu principal, doublure (si applicable), zip OU boutons, col, poches, fil de couture",
  "Chemise : tissu principal, boutons, col, poches optionnelles, fil de couture",
  "Pantalon : tissu principal, zip ou bouton, ceinture ou élastique, poches, fil de couture",
  "Hoodie : tissu principal (molleton), zip ou cordon, poche kangourou, côtes (bords-côtes), fil",
  "T-shirt : tissu principal, col ras-du-cou ou col V, fil de couture",
  "",
  "Réponds UNIQUEMENT avec ce JSON (sans markdown, sans texte autour) :",
  JSON.stringify({
    action: "analyze",
    design: {
      type: "veste",
      matiere: "coton",
      coupe: "oversize",
      couleur: "noir",
      style: "streetwear",
    },
    components_needed: [
      { category: "Tissu", description: "tissu principal coton noir", keywords: ["coton", "tissu", "noir"] },
      { category: "Fermeture", description: "zip central", keywords: ["zip", "fermeture"] },
      { category: "Doublure", description: "doublure légère", keywords: ["doublure"] },
      { category: "Bouton", description: "boutons col", keywords: ["bouton"] },
    ],
    message: "Je crée ta veste maintenant..."
  }),
  "",
  "Pour les RAFFINEMENTS, mets à jour les champs concernés et renvoie le même format.",
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
            { type: 'text', text: msg.content || 'Analyse ce vêtement et crée-le avec les composants disponibles.' },
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
        system: ANALYSIS_PROMPT,
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
