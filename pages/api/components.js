export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { design } = req.body;

  try {
    const tableName = encodeURIComponent(process.env.AIRTABLE_TABLE_NAME);
    const baseId = process.env.AIRTABLE_BASE_ID;

    // Fetch all records from Airtable
    let records = [];
    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${baseId}/${tableName}`,
        { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
      );
      const data = await response.json();
      records = data.records || [];
    } catch (e) {
      console.error('Airtable fetch error:', e);
    }

    // Identify which components the design needs
    const needed = getNeededComponents(design);

    // For each needed component, find the best match with fallback
    const components = await Promise.all(
      needed.map(need => resolveComponent(need, records))
    );

    res.status(200).json({ components: components.filter(Boolean) });

  } catch (error) {
    console.error('Components error:', error);
    res.status(500).json({ error: error.message, components: [] });
  }
}

// ── Identify what components the design needs ─────────────────────────────────
function getNeededComponents(design) {
  const { matiere, couleur, details = '' } = design;
  const needed = [];
  const detailsLower = details.toLowerCase();

  // Always need main fabric
  if (matiere) {
    needed.push({
      category: 'Tissu',
      matiere,
      couleur,
      label: `${matiere} ${couleur}`.trim(),
    });
  }

  // Parse details for extra components
  if (detailsLower.includes('zip') || detailsLower.includes('fermeture')) {
    const zipColor = extractColor(details) || couleur;
    needed.push({
      category: 'Fermeture',
      matiere: 'zip',
      couleur: zipColor,
      label: `Zip — ${zipColor}`.trim(),
    });
  }

  if (detailsLower.includes('bouton')) {
    needed.push({ category: 'Bouton', matiere: 'bouton', couleur, label: 'Boutons' });
  }

  if (detailsLower.includes('doublure')) {
    needed.push({ category: 'Doublure', matiere: 'doublure', couleur, label: 'Doublure' });
  }

  if (detailsLower.includes('élastique') || detailsLower.includes('elastique')) {
    needed.push({ category: 'Élastique', matiere: 'élastique', couleur, label: 'Élastique' });
  }

  return needed;
}

// ── Extract color from text ───────────────────────────────────────────────────
function extractColor(text) {
  const colors = ['rouge', 'noir', 'blanc', 'doré', 'or', 'argent', 'bleu', 'vert', 'jaune', 'rose', 'violet', 'marron', 'beige', 'gris'];
  const lower = text.toLowerCase();
  for (const color of colors) {
    if (lower.includes(color)) return color;
  }
  return null;
}

// ── Score a record against a need ────────────────────────────────────────────
function scoreRecord(record, need) {
  const f = record.fields;
  const keywords  = (f['AI mot clés'] || '').toLowerCase();
  const compo     = (f['Composition'] || '').toLowerCase();
  const couleurF  = (f['Couleur'] || '').toLowerCase();
  const nom       = (f['Nom'] || '').toLowerCase();
  const typeField = (f['Type'] || '').toLowerCase();
  const sousType  = (f['Sous-type'] || '').toLowerCase();

  let score = 0;

  if (need.category && typeField.includes(need.category.toLowerCase())) score += 10;

  for (const word of (need.matiere || '').toLowerCase().split(/[\s,]+/)) {
    if (word.length > 2) {
      if (keywords.includes(word)) score += 4;
      if (compo.includes(word))    score += 4;
      if (nom.includes(word))      score += 2;
      if (sousType.includes(word)) score += 2;
    }
  }

  for (const word of (need.couleur || '').toLowerCase().split(/[\s,]+/)) {
    if (word.length > 2) {
      if (couleurF.includes(word)) score += 3;
      if (keywords.includes(word)) score += 2;
      if (nom.includes(word))      score += 1;
    }
  }

  return score;
}

function formatRecord(f, source, sourceLabel, originalNeed) {
  return {
    nom:          f['Nom'] || '',
    type:         f['Type'] || '',
    sousType:     f['Sous-type'] || '',
    composition:  f['Composition'] || '',
    couleur:      f['Couleur'] || '',
    prix:         f['Prix (mètre ou unité)'] || '',
    fournisseur:  f['Fournisseur'] || '',
    photo:        f['Photo']?.[0]?.url || null,
    summary:      f['Product page ai sumary'] || '',
    moq:          f['MOQ'] || '',
    source,
    sourceLabel,
    originalNeed: originalNeed || null,
  };
}

// ── Resolve with 4-level fallback ─────────────────────────────────────────────
async function resolveComponent(need, records) {

  const scored = records
    .map(r => ({ score: scoreRecord(r, need), record: r }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // LEVEL 1 — Exact match (score ≥ 14 = catégorie + matière + couleur)
  if (scored[0]?.score >= 14) {
    return formatRecord(scored[0].record.fields, 'base', '✓ En stock');
  }

  // LEVEL 2 — Similar in DB (score ≥ 4 = au moins catégorie ou matière)
  if (scored[0]?.score >= 4) {
    return formatRecord(
      scored[0].record.fields,
      'similar',
      '~ Similaire disponible',
      need.label
    );
  }

  // LEVEL 3 — Web search
  try {
    const webResult = await searchWebForComponent(need);
    if (webResult) return webResult;
  } catch (e) {
    console.error('Web search failed:', e);
  }

  // LEVEL 4 — À créer
  return {
    nom:          need.label,
    type:         need.category,
    sousType:     '',
    composition:  need.matiere,
    couleur:      need.couleur || '',
    prix:         'Sur devis',
    fournisseur:  '',
    photo:        null,
    summary:      '',
    moq:          '',
    source:       'a_creer',
    sourceLabel:  '◎ À sourcer / créer',
    originalNeed: need.label,
  };
}

// ── Web search via Claude ─────────────────────────────────────────────────────
async function searchWebForComponent(need) {
  const query = `${need.label} fournisseur textile prix`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':        process.env.ANTHROPIC_API_KEY,
      'anthropic-version':'2023-06-01',
      'anthropic-beta':   'web-search-2025-03-05',
      'content-type':     'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Cherche un fournisseur pour : "${query}". 
Retourne UNIQUEMENT ce JSON valide, sans markdown :
{"nom":"...","type":"${need.category}","composition":"${need.matiere}","couleur":"${need.couleur||''}","prix":"...","fournisseur":"...","url":"..."}
Si tu ne trouves rien de pertinent, retourne: null`,
      }],
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const textBlock = data.content?.find(b => b.type === 'text');
  if (!textBlock) return null;

  const cleaned = textBlock.text.trim().replace(/```json|```/g, '').trim();
  if (cleaned === 'null') return null;

  const parsed = JSON.parse(cleaned);
  if (!parsed?.nom) return null;

  return {
    nom:          parsed.nom,
    type:         parsed.type || need.category,
    sousType:     '',
    composition:  parsed.composition || need.matiere,
    couleur:      parsed.couleur || need.couleur || '',
    prix:         parsed.prix || 'Sur devis',
    fournisseur:  parsed.fournisseur || '',
    photo:        null,
    summary:      parsed.url ? `Source : ${parsed.url}` : '',
    moq:          '',
    source:       'web',
    sourceLabel:  '🌐 Référence externe',
    originalNeed: need.label,
  };
}
