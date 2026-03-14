export default async function handler(req, res) {
try {
const tableName = encodeURIComponent(process.env.AIRTABLE_TABLE_NAME);
const baseId = process.env.AIRTABLE_BASE_ID;
const response = await fetch(
'https://api.airtable.com/v0/' + baseId + '/' + tableName,
{ headers: { Authorization: 'Bearer ' + process.env.AIRTABLE_API_KEY } }
);
const data = await response.json();
const records = data.records || [];
const fields = records[0] ? records[0].fields : {};
res.status(200).json({
total: records.length,
champs: Object.keys(fields),
premier: fields
});
} catch (e) {
res.status(500).json({ erreur: e.message });
}
}
