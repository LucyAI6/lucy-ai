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
 
  // Résumé des composants réels disponibles
  const available = components.filter(c => c.source === 'exact' || c.source === 'similar');
  const notFound  = components.filter(c => c.source === 'not_found');
 
  const componentsSummary = available.map(c => {
    return `- ${c.category} : "${c.nom}" | couleur: ${c.couleur || 'non précisée'} | composition: ${c.composition || 'non précisée'}`;
  }).join('\n');
 
  const notFoundSummary = notFound.length > 0
    ? 'Composants absents de la base (rendu générique) : ' + notFound.map(c => c.needed).join(', ')
    : '';
 
  const systemMsg = [
    'Tu es un directeur artistique de mode expert en prompt engineering pour IA générative.',
    'Tu dois créer un prompt en anglais pour générer une photo de vêtement ultra-réaliste.',
    '',
    'RÈGLES ABSOLUES :',
    '- Le prompt doit décrire EXACTEMENT les composants listés ci-dessous, avec leurs vraies couleurs',
    '- Chaque composant visible doit être décrit avec précision dans le prompt',
    '- Le vêtement doit être VU EN ENTIER, rien de coupé, du col au bas',
    '- Qualité photo éditoriale Vogue, shooting professionnel, lumière dramatique',
    '- Réponds UNIQUEMENT avec le prompt en anglais, rien d\'autre, pas de markdown',
  ].join('\n');
 
  const userMsg = [
    'Crée un prompt image pour ce vêtement :',
    '',
    'TYPE : ' + design.type,
    'COUPE : ' + design.coupe,
    'STYLE : ' + (design.style || 'classique'),
    '',
    'COMPOSANTS RÉELS DISPONIBLES EN BASE :',
    componentsSummary || 'Aucun composant trouvé',
    '',
    notFoundSummary,
    '',
    'Le prompt doit intégrer chaque composant avec sa vraie couleur et matière.',
    'Exemple : si zip rouge → "prominent red zipper clearly visible"',
    'Si tissu noir coton → "black cotton fabric with visible texture"',
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
      max_tokens: 500,
      system: systemMsg,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
 
  if (!response.ok) {
    // Fallback prompt si Claude échoue
    const c = design.couleur || 'black';
    const m = design.matiere || 'fabric';
    const t = design.type    || 'garment';
    return `Ultra-realistic fashion editorial photography, full ${c} ${m} ${t} visible from collar to hem, Vogue quality, professional studio lighting, photorealistic 8k`;
  }
 
  const data = await response.json();
  return data.content[0].text.trim();
}
