export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { design, components_needed } = req.body;

  try {
    // Fetch all Airtable records
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = encodeURIComponent(process.env.AIRTABLE_TABLE_NAME);
    const response = await fetch(
      'https://api.airtable.com/v0/' + baseId + '/' + tableName,
      { headers: { Authorization: 'Bearer ' + process.env.AIRTABLE_API_KEY } }
    );
    const data = await response.json();
    const records = data.records || [];

    // For each needed component, find best match in Airtable
    const resolved = components_needed.map(need => resolve(need, records));

    res.status(200).json({ components: resolved });

  } catch (error) {
    console.error('Components error:', error);
    res.status(500).json({ error: error.message, components: [] });
  }
}

// ── Score a record against a needed component ─────────────────────────────────
function score(record, need) {
  const f = record.fields;
  const type    = (f['Type'] || '').toLowerCase();
  const compo   = (f['Composition'] || '').toLowerCase();
  const couleur = (f['Couleur'] || '').toLowerCase();
  const nom     = (f['Nom'] || '').toLowerCase();
  const keywords= (f['AI mot clés'] || '').toLowerCase();
  const sousType= (f['Sous-type'] || '').toLowerCase();

  let s = 0;

  // Category match (mandatory)
  if (need.category && type.includes(need.category.toLowerCase())) s += 15;

  // Keyword match
  for (const kw of (need.keywords || [])) {
    const k = kw.toLowerCase();
    if (k.length < 2) continue;
    if (keywords.includes(k)) s += 4;
    if (compo.includes(k))    s += 4;
    if (nom.includes(k))      s += 3;
    if (sousType.includes(k)) s += 2;
    if (couleur.includes(k))  s += 3;
    if (type.includes(k))     s += 2;
  }

  return s;
}

function formatRecord(f, source, sourceLabel, need) {
  return {
    nom:          f['Nom'] || '',
    type:         f['Type'] || '',
    sousType:     f['Sous-type'] || '',
    composition:  f['Composition'] || '',
    couleur:      f['Couleur'] || '',
    prix:         f['Prix (mètre ou unité)'] || '',
    fournisseur:  f['Fournisseur'] || '',
    photo:        f['Photo']?.[0]?.url || null,
    moq:          f['MOQ'] || '',
    source,
    sourceLabel,
    needed:       need.description,
    category:     need.category,
  };
}

// ── 3-level resolution ────────────────────────────────────────────────────────
function resolve(need, records) {
  const scored = records
    .map(r => ({ s: score(r, need), r }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);

  // Level 1 — Exact match (category + at least one keyword strongly matched)
  if (scored[0]?.s >= 18) {
    return formatRecord(scored[0].r.fields, 'exact', '✓ En stock', need);
  }

  // Level 2 — Similar (category matches but not all keywords)
  if (scored[0]?.s >= 15) {
    return formatRecord(scored[0].r.fields, 'similar', '~ Similaire', need);
  }

  // Level 3 — Not found, display placeholder
  return {
    nom:         need.description,
    type:        need.category,
    sousType:    '',
    composition: '',
    couleur:     '',
    prix:        'À sourcer',
    fournisseur: '',
    photo:       null,
    moq:         '',
    source:      'not_found',
    sourceLabel: '◎ Introuvable en base',
    needed:      need.description,
    category:    need.category,
  };
}
