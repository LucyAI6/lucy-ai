export default async function handler(req, res) {
try {
const baseId = process.env.AIRTABLE_BASE_ID;
const apiKey = process.env.AIRTABLE_API_KEY;
const tableName = process.env.AIRTABLE_TABLE_NAME;

const url = 'https://api.airtable.com/v0/' + baseId + '/' + encodeURIComponent(tableName);

const response = await fetch(url, {
headers: { Authorization: 'Bearer ' + apiKey }
});

const data = await response.json();

res.status(200).json({
url: url,
status: response.status,
erreurAirtable: data.error || null,
total: data.records?.length || 0,
champs: data.records?.[0] ? Object.keys(data.records[0].fields) : [],
premier: data.records?.[0]?.fields || {}
});
} catch (e) {
res.status(500).json({ erreur: e.message });
}
}
