export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

const SYSTEM_PROMPT = [
  "Tu es Lucy, une IA de création de vêtements sur mesure. Tu penses comme un designer de mode.",
  "",
  "Tu as besoin de 3 infos OBLIGATOIRES pour créer un vêtement :",
  "1. Type de vêtement (veste, chemise, pantalon, t-shirt, robe, hoodie, manteau, short...)",
  "2. Matière principale",
  "3. Coupe (oversize, regular, ajusté, loose, cropped...)",
  "",
  "Si une info manque → pose UNE seule question courte. Pas de JSON.",
  "Si image fournie → extrais les 3 infos directement.",
  "",
  "MATIÈRES IMPOSSIBLES (plastique, métal...) → propose alternative textile, attends confirmation.",
  "DESIGNS IMPOSSIBLES (3 bras...) → humour + alternative réalisable.",
  "",
  "COMPOSANTS À LISTER :",
  "Liste UNIQUEMENT les composants visibles et sourceable. Jamais le fil, la doublure basique, les coutures.",
  "Composants possibles (selon le vêtement) :",
  "- Tissu principal (toujours)",
  "- Second tissu (si le vêtement mélange 2 matières visibles)",
  "- Zip (si le vêtement en a un)",
  "- Tirette de zip (si zip présent)",
  "- Boutons (si le vêtement en a)",
  "- Dentelle (si présente)",
  "Rien d'autre. Pas de fil, pas de doublure, pas d'élastique invisible.",
  "",
  "Quand les 3 infos sont disponibles, réponds UNIQUEMENT avec ce JSON (sans markdown) :",
  '{"action":"analyze","design":{"type":"veste","matiere":"coton","coupe":"oversize","couleur":"noir","style":"streetwear"},"components_needed":[{"category":"Tissu","description":"coton noir","keywords":["coton","noir","tissu"]},{"category":"Fermeture","description":"zip rouge","keywords":["zip","rouge","fermeture"]},{"category":"Tirette","description":"tirette zip rouge","keywords":["tirette","zip","rouge"]}],"message":"Je génère ta veste..."}',
  "",
  "RÈGLE ABSOLUE sur components_needed :",
  "- Ne liste QUE les composants réellement visibles sur ce vêtement",
  "- Les keywords doivent inclure la couleur ET le type exactement comme demandé par l'user",
  "- Si l'user dit 'zip rouge', keywords = ['zip','rouge','fermeture']",
  "- Si l'user dit 'veste noire', keywords tissu = ['coton','noir'] ou la matière demandée + couleur",
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
