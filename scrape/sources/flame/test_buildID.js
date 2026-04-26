const { http_get_with_retry } = require('../../lib/helpers'); 

async function fetch_build_id()
{
	const { status, body } = await http_get_with_retry('https://flamecomics.xyz');
	if (status !== 200) throw new Error(`Homepage returned HTTP ${status}`);

	const match = body.match(/"buildId"\s*:\s*"([^"]+)"/);
	if (!match) throw new Error('buildId not found');

	return match[1];
}

(async () =>
{
	try
	{
		const buildId = await fetch_build_id();
		console.log(buildId);
	}
	catch (err)
	{
		console.error(err.message);
	}
})();