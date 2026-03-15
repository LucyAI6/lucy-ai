export const config = {
  api: { responseLimit: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { design, components } = req.body;

  try {
    // ── ÉTAPE 1 : Claude construit le prompt depuis les vrais composants ────────
    const imagePrompt = await buildPromptWithClaude(design, components);

    // ── ÉTAPE 2 : Replicate génère l'image ─────────────────────────────────────
    const startRes = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.REPLICATE_API_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'wait=60',
        },
        body: JSON.stringify({
          input: {
            prompt: imagePrompt,
            width: 832,
            height: 1216,
            output_format: 'jpg',
            output_quality: 95,
            safety_tolerance: 5,
          },
        }),
      }
    );

    if (!startRes.ok) throw new Error('Replicate error: ' + await startRes.text());
    const prediction = await startRes.json();

    if (prediction.output) {
      const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      return res.status(200).json({ imageUrl: url, prompt: imagePrompt });
    }

    if (!prediction.id) throw new Error('No prediction ID');

    // Poll
    let imageUrl = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await fetch('https://api.replicate.com/v1/predictions/' + prediction.id, {
        headers: { Authorization: 'Bearer ' + process.env.REPLICATE_API_KEY },
      });
      const pollData = await poll.json();
      if (pollData.status === 'succeeded') {
        imageUrl = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        break;
      }
      if (pollData.status === 'failed') throw new Error('Generation failed: ' + pollData.error);
    }

    if (!imageUrl) throw new Error('Timeout — réessaie.');
    res.status(200).json({ imageUrl, prompt: imagePrompt });

  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({ error: error.message });
  }
}

// ── Claude construit le prompt image depuis les vrais composants Airtable ─────
async function buildPromptWithClaude(design, components) {
  const available = components.filter(c => c.source === 'exact' || c.source === 'similar');

  const componentsList = available.map(c =>
    `${c.category}: couleur="${c.couleur || 'non définie'}", matière="${c.composition || 'non définie'}", nom="${c.nom}"`
  ).join('\n');

  const systemMsg = [
    'Tu es un expert en prompt engineering pour génération d\'images de mode.',
    'Tu dois créer un prompt en anglais pour générer une photo de vêtement.',
    '',
    'RÈGLE ABSOLUE : Le prompt décrit UNIQUEMENT et EXACTEMENT les composants listés.',
    'Aucun élément visuel ne peut apparaître dans le prompt s\'il n\'est pas dans la liste.',
    'Si pas de zip dans la liste → le mot "zip" ou "zipper" ne doit PAS apparaître.',
    'Si pas de boutons dans la liste → le mot "button" ne doit PAS apparaître.',
    'Si zip rouge dans la liste → "red zipper" doit apparaître.',
    'Chaque composant de la liste doit être décrit avec sa vraie couleur et matière.',
    '',
    'Format du prompt : description précise du vêtement avec ses vrais composants,',
    'suivi de : ultra-realistic editorial fashion photography, full garment visible from collar to hem,',
    'nothing cropped, professional studio lighting, Vogue quality, photorealistic 8k.',
    'Réponds UNIQUEMENT avec le prompt en anglais, rien d\'autre.',
  ].join('\n');

  const userMsg = [
    'Vêtement : ' + design.coupe + ' ' + design.type + ' style ' + (design.style || 'classique'),
    '',
    'Composants EXACTS à décrire (rien d\'autre) :',
    componentsList || 'Tissu ' + (design.couleur || '') + ' ' + (design.matiere || ''),
  ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemMsg,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!response.ok) {
    return 'Ultra-realistic fashion editorial photography, full ' + (design.couleur || '') + ' ' + (design.matiere || '') + ' ' + (design.type || '') + ', nothing cropped, Vogue quality, photorealistic 8k';
  }

  const data = await response.json();
  return data.content[0].text.trim();
}
