export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { design } = req.body;

  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = encodeURIComponent(process.env.AIRTABLE_TABLE_NAME);

    const response = await fetch(
      'https://api.airtable.com/v0/' + baseId + '/' + tableName,
      { headers: { Authorization: 'Bearer ' + process.env.AIRTABLE_API_KEY } }
    );

    const data = await response.json();
    const records = data.records || [];
    const needed = getNeededComponents(design);

    // Déduplique — un seul résultat par catégorie
    const seen = new Set();
    const components = needed
      .map(need => resolveComponent(need, records))
      .filter(c => {
        if (!c) return false;
        if (seen.has(c.type)) return false;
        seen.add(c.type);
        return true;
      });

    res.status(200).json({ components });

  } catch (error) {
    res.status(500).json({ error: error.message, components: [] });
  }
}

function getNeededComponents(design) {
  const { matiere, couleur, details = '' } = design;
  const needed = [];
  const d = details.toLowerCase();

  // Tissu principal — toujours
  if (matiere) {
    needed.push({
      category: 'Tissu',
      matiere,
      couleur,
      label: matiere + ' ' + (couleur || ''),
    });
  }

  // Fermeture — uniquement si explicitement mentionnée dans les détails
  if (d.includes('zip') || d.includes('fermeture éclair') || d.includes('fermeture zip')) {
    needed.push({
      category: 'Fermeture',
      matiere: 'zip',
      couleur: extractColor(details) || couleur,
      label: 'Zip ' + (extractColor(details) || ''),
    });
  }

  // Bouton — uniquement si explicitement mentionné
  if (d.includes('bouton')) {
    needed.push({
      category: 'Bouton',
      matiere: 'bouton',
      couleur,
      label: 'Boutons',
    });
  }

  // Doublure — uniquement si explicitement mentionnée
  if (d.includes('doublure')) {
    needed.push({
      category: 'Doublure',
      matiere: 'doublure',
      couleur,
      label: 'Doublure',
    });
  }

  return needed;
}

function extractColor(text) {
  const colors = ['rouge', 'noir', 'blanc', 'doré', 'or', 'argent', 'bleu', 'vert', 'jaune', 'rose', 'violet', 'marron', 'beige', 'gris'];
  for (const color of colors) {
    if (text.toLowerCase().includes(color)) return color;
  }
  return null;
}

function scoreRecord(record, need) {
  const f = record.fields;
  const keywords = (f['AI mot clés'] || '').toLowerCase();
  const compo    = (f['Composition'] || '').toLowerCase();
  const couleurF = (f['Couleur'] || '').toLowerCase();
  const nom      = (f['Nom'] || '').toLowerCase();
  const type     = (f['Type'] || '').toLowerCase();

  let score = 0;

  // Catégorie (priorité absolue)
  if (need.category && type.includes(need.category.toLowerCase())) score += 10;

  // Matière
  for (const word of (need.matiere || '').toLowerCase().split(/[\s,]+/)) {
    if (word.length > 2) {
      if (keywords.includes(word)) score += 4;
      if (compo.includes(word))    score += 4;
      if (nom.includes(word))      score += 2;
    }
  }

  // Couleur
  for (const word of (need.couleur || '').toLowerCase().split(/[\s,]+/)) {
    if (word.length > 2) {
      if (couleurF.includes(word)) score += 3;
      if (keywords.includes(word)) score += 2;
    }
  }

  return score;
}

function resolveComponent(need, records) {
  const scored = records
    .map(r => ({ score: scoreRecord(r, need), record: r }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const f = scored[0].record.fields;
    const isExact = scored[0].score >= 14;
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
      source:       isExact ? 'base' : 'similar',
      sourceLabel:  isExact ? '✓ En stock' : '~ Similaire disponible',
      originalNeed: need.label,
    };
  }

  // Rien trouvé
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
    sourceLabel:  '◎ À sourcer',
    originalNeed: need.label,
  };
}
