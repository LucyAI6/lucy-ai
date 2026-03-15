export const config = {
  api: { responseLimit: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { design, components } = req.body;

  try {
    // Build prompt ONLY from real Airtable components
    const prompt = buildPrompt(design, components);

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
            prompt,
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
      return res.status(200).json({ imageUrl: url, prompt });
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
    res.status(200).json({ imageUrl, prompt });

  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({ error: error.message });
  }
}

// ── Build prompt from REAL components only ────────────────────────────────────
function buildPrompt(design, components) {
  // Only use components that exist in the DB (exact or similar)
  const available = components.filter(c => c.source === 'exact' || c.source === 'similar');
  const notFound  = components.filter(c => c.source === 'not_found');

  const tissu    = available.find(c => c.category === 'Tissu');
  const zip      = available.find(c => c.category === 'Fermeture');
  const bouton   = available.find(c => c.category === 'Bouton');
  const doublure = available.find(c => c.category === 'Doublure');

  // Use REAL colors and materials from DB, fallback to design if nothing found
  const couleur  = tissu?.couleur  || design.couleur  || 'black';
  const matiere  = tissu?.composition || design.matiere || 'fabric';
  const coupe    = design.coupe || 'regular';
  const type     = design.type  || 'garment';
  const style    = design.style || '';

  // Build detailed description from real components
  const details = [];
  if (zip)      details.push((zip.couleur || '') + ' zipper closure');
  if (bouton)   details.push((bouton.couleur || '') + ' buttons');
  if (doublure) details.push((doublure.composition || '') + ' lining');

  // For not-found components, show a neutral/generic version
  const notFoundNote = notFound.length > 0
    ? 'generic ' + notFound.map(c => c.category.toLowerCase()).join(', ')
    : '';

  const prompt = [
    'Ultra-realistic fashion editorial photography',
    'full garment visible, nothing cropped',
    coupe + ' fit',
    couleur,
    matiere,
    style,
    type,
    details.join(', '),
    notFoundNote,
    'detailed fabric texture and stitching visible',
    'shot on a professional model in a high-end studio',
    'dramatic editorial lighting, sharp focus, photorealistic',
    'Vogue fashion shoot quality',
    'full body shot showing the complete garment from collar to hem',
  ].filter(Boolean).join(', ');

  return prompt;
}
