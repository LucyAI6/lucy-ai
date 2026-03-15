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
  "RÈGLES SUR LES COMPOSANTS — LIS ATTENTIVEMENT :",
  "",
  "1. REFUS EXPLICITE : Si l'user dit 'sans zip', 'pas de zip', 'sans boutons'...",
  "   → Ce composant est INTERDIT. Ne l'ajoute jamais, même en improvisation.",
  "",
  "2. DEMANDE EXPLICITE : Si l'user dit 'avec zip rouge', 'boutons dorés'...",
  "   → Ce composant est OBLIGATOIRE avec exactement les caractéristiques demandées.",
  "",
  "3. NON MENTIONNÉ : Si l'user ne précise pas un composant...",
  "   → Tu improvises comme un designer, en choisissant ce qui est cohérent avec le vêtement et le style.",
  "   → Exemples : veste streetwear → zip probable. Veste formelle → boutons probable. Hoodie → cordon.",
  "   → Tu peux ajouter des poches, un col, des détails si c'est cohérent.",
  "",
  "Composants possibles :",
  "- Tissu principal (TOUJOURS)",
  "- Second tissu (si 2 matières différentes visibles)",
  "- Zip (tirette incluse)",
  "- Boutons",
  "- Dentelle",
  "",
  "Quand les 3 infos sont dispo, réponds UNIQUEMENT avec ce JSON (sans markdown) :",
  '{"action":"analyze","design":{"type":"veste","matiere":"coton","coupe":"oversize","couleur":"noir","style":"streetwear"},"components_needed":[{"category":"Tissu","description":"coton noir","keywords":["coton","noir","tissu"]},{"category":"Fermeture","description":"zip noir","keywords":["zip","noir","fermeture"]}],"message":"Je génère ta veste..."}',
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
