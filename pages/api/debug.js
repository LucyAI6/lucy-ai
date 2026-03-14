export default async function handler(req, res) {
try {
const baseId = process.env.AIRTABLE_BASE_ID;
const apiKey = process.env.AIRTABLE_API_KEY;

// On liste toutes les tables de la base
const response = await fetch(
'https://api.airtable.com/v0/meta/bases/' + baseId + '/tables',
{ headers: { Authorization: 'Bearer ' + apiKey } }
);

const data = await response.json();

res.status(200).json({
status: response.status,
tables: data.tables?.map(t => ({ id: t.id, name: t.name })) || [],
erreur: data.error || null
});
} catch (e) {
res.status(500).json({ erreur: e.message });
}
}
