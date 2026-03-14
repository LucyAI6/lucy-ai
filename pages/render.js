export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { design } = req.body;

  try {
    const prompt = design.prompt_image;

    // Start prediction with flux-1.1-pro
    const startRes = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait=60', // Wait up to 60s for result
        },
        body: JSON.stringify({
          input: {
            prompt,
            width: 768,
            height: 1024,
            output_format: 'jpg',
            output_quality: 90,
            safety_tolerance: 5,
          },
        }),
      }
    );

    if (!startRes.ok) {
      const errText = await startRes.text();
      throw new Error(`Replicate API error: ${errText}`);
    }

    const prediction = await startRes.json();

    // If Prefer: wait worked and we got output directly
    if (prediction.output) {
      const imageUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
      return res.status(200).json({ imageUrl });
    }

    // Otherwise poll manually
    if (!prediction.id) {
      throw new Error('No prediction ID returned');
    }

    let imageUrl = null;
    let attempts = 0;
    const maxAttempts = 40; // 40 * 3s = 120s max

    while (!imageUrl && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 3000));

      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.REPLICATE_API_KEY}`,
          },
        }
      );

      const pollData = await pollRes.json();

      if (pollData.status === 'succeeded') {
        imageUrl = Array.isArray(pollData.output)
          ? pollData.output[0]
          : pollData.output;
      } else if (pollData.status === 'failed') {
        throw new Error(`Generation failed: ${pollData.error}`);
      }

      attempts++;
    }

    if (!imageUrl) {
      throw new Error('Generation timeout — réessaie dans quelques instants.');
    }

    res.status(200).json({ imageUrl });

  } catch (error) {
    console.error('Render API error:', error);
    res.status(500).json({ error: error.message });
  }
}
