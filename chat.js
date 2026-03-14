export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const SYSTEM_PROMPT = `Tu es Lucy, une IA spécialisée dans la création de vêtements sur mesure. Tu es élégante, précise et créative.

Tu as besoin de 3 informations OBLIGATOIRES pour générer un vêtement :
1. Type de vêtement (veste, chemise, pantalon, t-shirt, robe, hoodie, manteau, short...)
2. Matière principale (coton, denim, nylon, laine, soie, polyester, cuir, lin...)
3. Coupe (oversize, regular, ajusté/slim, loose, cropped...)

Pour les détails secondaires (boutons, poches, col, fermetures, couleur, style), tu improvises intelligemment si non précisés. La couleur par défaut est noir si non précisée.

RÈGLES DE CONVERSATION :
- Si des infos obligatoires manquent, pose UNE seule question courte et claire
- Ne pose jamais plusieurs questions en même temps  
- Sois concise, 1-2 phrases maximum
- Tu parles en français, ton amical et professionnel
- Si l'user uploade une image, analyse-la et extrais automatiquement type, coupe et matière si visibles

QUAND tu as les 3 informations obligatoires, réponds UNIQUEMENT avec ce JSON valide (sans markdown, sans texte autour) :
{
  "action": "generate",
  "design": {
    "type": "veste",
    "matiere": "coton",
    "coupe": "oversize",
    "couleur": "noir",
    "style": "streetwear",
    "details": "zip rouge sur le devant, col droit, deux poches latérales plaquées",
    "prompt_image": "Professional fashion photography, oversized black cotton streetwear jacket, red zipper front closure, straight collar, side patch pockets, flat lay on pure white background, high quality studio lighting, detailed fabric texture, fashion editorial style"
  },
  "message": "Parfait ! Je génère ta veste maintenant..."
}

Pour les RAFFINEMENTS (l'user modifie un design existant), mets à jour uniquement les champs concernés et renvoie le même format JSON.

Le champ prompt_image doit TOUJOURS être en anglais, très descriptif, et se terminer par "flat lay on pure white background, studio lighting, professional fashion photography, high quality".`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, imageBase64, imageMediaType } = req.body;

  try {
    // Build Claude messages - attach image to the last user message if provided
    const claudeMessages = messages.map((msg, index) => {
      const isLastUserMsg = index === messages.length - 1 && msg.role === 'user';
      
      if (isLastUserMsg && imageBase64) {
        return {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageMediaType || 'image/jpeg',
                data: imageBase64,
              }
            },
            {
              type: 'text',
              text: msg.content || 'Analyse ce vêtement et reproduis-le avec tes matières disponibles.'
            }
          ]
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
      throw new Error(`Anthropic API error: ${err}`);
    }

    const data = await response.json();
    const content = data.content[0].text.trim();

    // Try to parse as JSON (design ready)
    try {
      const parsed = JSON.parse(content);
      if (parsed.action === 'generate') {
        return res.status(200).json({ type: 'design', data: parsed });
      }
    } catch (e) {
      // Not JSON — it's a regular conversational message
    }

    return res.status(200).json({ type: 'message', content });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ error: error.message });
  }
}
