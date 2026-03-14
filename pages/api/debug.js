export default async function handler(req, res) {
res.status(200).json({
hasKey: !!process.env.AIRTABLE_API_KEY,
keyStart: process.env.AIRTABLE_API_KEY?.substring(0, 10) || 'VIDE',
hasBase: !!process.env.AIRTABLE_BASE_ID,
baseId: process.env.AIRTABLE_BASE_ID || 'VIDE',
hasTable: !!process.env.AIRTABLE_TABLE_NAME,
tableName: process.env.AIRTABLE_TABLE_NAME || 'VIDE',
});
}
