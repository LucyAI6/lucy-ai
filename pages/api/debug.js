export default async function handler(req, res) {
const tableName = encodeURIComponent(process.env.AIRTABLE_TABLE_NAME);
const baseId = process.env.AIRTABLE_BASE_ID;

const response = await fetch(
`https://api.airtable.com/v0/${baseId}/${tableName}`,
{ headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
);

const data = await response.json();
const records = data.records || [];

// Retourne les noms de champs exacts du premier record
const fields = records[0]?.fields || {};

res.status(200).json({
totalRecords: records.length,
fieldNames: Object.keys(fields),
firstRecord: fields,
});
}

