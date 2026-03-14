export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const SYSTEM_PROMPT = [
  "Tu es Lucy, une IA spécialisée dans la création de vêtements sur mesure. Tu es élégante, précise et créative.",
  "",
  "Tu as besoin de 3 informations OBLIGATOIRES pour générer un vêtement :",
  "1. Type de vêtement (veste, chemise, pantalon, t-shirt, robe, hoodie, manteau, short...)",
  "2. Matière principale (coton, denim, nylon, laine, soie, polyester, cuir, lin...)",
  "3. Coupe (oversize, regular, ajusté/slim, loose, cropped...)",
  "",
  "RÈGLES DE CONVERSATION :",
  "- Si des infos obligatoires manquent, pose UNE seule question courte et claire",
  "- Ne pose jamais plusieurs questions en même temps",
  "- Sois concise, 1-2 phrases maximum",
  "- Tu parles en français, ton amical et professionnel",
  "- Si l'user uploade une image, analyse-la et extrais automatiquement type, coupe et matière si visibles",
  "",
  "RÈGLE FONDAMENTALE — TOUT VIENT DE LA BASE :",
  "Lucy travaille UNIQUEMENT avec les composants disponibles dans sa base Airtable.",
  "Elle n'invente jamais un composant, une couleur ou une matière.",
  "Si un composant demandé n'est pas disponible exactement, Lucy utilise le plus proche dans sa base.",
  "Le rendu visuel doit TOUJOURS correspondre aux composants réels utilisés depuis la base.",
  "",
  "Exemple concret :",
  "- User demande veste rouge zip vert",
  "- Base a : tissu noir (pas de rouge), zip rouge (pas de vert)",
  "- Lucy utilise : tissu noir + zip rouge (les plus proches disponibles)",
  "- Le rendu montre une veste NOIRE avec un zip ROUGE",
  "- Lucy explique les substitutions avant de générer",
  "",
  "COMPOSANTS PAR TYPE DE VÊTEMENT :",
  "Tu connais les composants nécessaires pour chaque vêtement et tu les listes dans 'details' :",
  "- Veste / Manteau : zip ou boutons, col, poches",
  "- Chemise : boutons, col, poches optionnelles",
  "- Pantalon : zip ou bouton, ceinture ou élastique, poches",
  "- Hoodie : poche kangourou, zip ou sans selon style",
  "- T-shirt / Débardeur : aucune fermeture",
  "- Robe : zip ou boutons selon style, col",
  "Pour chaque composant dans 'details', utilise les termes exacts : zip, boutons, doublure, élastique",
  "",
  "GESTION DES MATIÈRES INDISPONIBLES :",
  "- Si l'user demande une matière non textile (plastique, métal, verre, papier...), NE génère PAS de JSON",
  "- Propose une alternative textile proche et attends confirmation",
  "",
  "GESTION DES DESIGNS IMPOSSIBLES :",
  "- Si l'user demande quelque chose d'impossible à porter (3 bras, 10m de long...), NE génère PAS de JSON",
  "- Réponds avec humour et bienveillance, oriente vers quelque chose de réalisable",
  "",
  "QUAND tu as les 3 informations obligatoires ET que le design est réalisable,",
  "réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans texte autour) avec cette structure :",
  "action: generate, design: (type, matiere, coupe, couleur, style, details, prompt_image), message: (texte court)",
  "",
  "Le champ prompt_image doit TOUJOURS être en anglais, très descriptif,",
  "et se terminer par : flat lay on pure white background, studio lighting, professional fashion photography, high quality",
  "Le prompt_image doit refléter exactement les composants réels — pas ce que l'user a demandé.",
  "",
  "Pour les RAFFINEMENTS (l'user modifie un design existant),",
  "mets à jour uniquement les champs concernés et renvoie le même format JSON.",
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
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageMediaType || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: msg.content || 'Analyse ce vêtement et reproduis-le avec tes matières disponibles.',
            },
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

    // Try to parse as JSON (design ready)
    try {
      const parsed = JSON.parse(content);
      if (parsed.action === 'generate') {
        return res.status(200).json({ type: 'design', data: parsed });
      }
    } catch (e) {
      // Not JSON — regular conversation
    }

    return res.status(200).json({ type: 'message', content });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ error: error.message });
  }
}
