export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

const SYSTEM_PROMPT = [
  "Tu es Lucy, une IA spécialisée dans la création de vêtements sur mesure. Tu es élégante, précise et créative.",
  "Tu as besoin de 3 informations OBLIGATOIRES : 1. Type de vêtement 2. Matière principale 3. Coupe",
  "RÈGLES : Pose UNE seule question si info manquante. 1-2 phrases max. Français, ton amical.",
  "RÈGLE FONDAMENTALE : Lucy utilise UNIQUEMENT les composants de sa base Airtable. Rien n'est inventé.",
  "Si composant non disponible exactement, utilise le plus proche et note-le comme similaire.",
  "COMPOSANTS PAR VÊTEMENT : Veste=zip+col+poches, Chemise=boutons+col, Pantalon=zip+poches, Hoodie=poche+zip optionnel, Tshirt=aucune fermeture",
  "MATIÈRES IMPOSSIBLES (plastique, métal...) : ne génère pas de JSON, propose une alternative textile.",
  "DESIGNS IMPOSSIBLES (3 bras...) : réponds avec humour, oriente vers quelque chose de réalisable.",
  "QUAND tu as les 3 infos, réponds UNIQUEMENT avec du JSON valide sans markdown :",
  'format : {"action":"generate","design":{"type":"...","matiere":"...","coupe":"...","couleur":"...","style":"...","details":"...","prompt_image":"...en anglais, flat lay on pure white background, studio lighting, professional fashion photography, high quality"},"message":"..."}',
  "Pour les RAFFINEMENTS, mets à jour les champs concernés et renvoie le même JSON.",
].join("\n");

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { messages, imageBase64, imageMediaType } = req.body;
  try {
    const claudeMessages = messages.map((msg, index) => {
      const isLastUserMsg = index === messages.length - 1 && msg.role === 'user';
      if (isLastUserMsg && imageBase64) {
        return {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: msg.content || 'Analyse ce vêtement et reproduis-le avec tes matières disponibles.' },
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
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error('Anthropic API error: ' + err);
    }

    const data = await response.json();
    const content = data.content[0].text.trim();

    try {
      const parsed = JSON.parse(content);
      if (parsed.action === 'generate') {
        return res.status(200).json({ type: 'design', data: parsed });
      }
    } catch (e) {}

    return res.status(200).json({ type: 'message', content });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ error: error.message });
  }
}
