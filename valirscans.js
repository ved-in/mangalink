// DO NOT TOUCH THIS
// LEAVE IT AS IT IS FOR NOW


const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function getAllSeries()
{
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log('Getting cookies...');
    await page.goto('https://valirscans.org/series?type=Manhwa,Manhua,Manga,Webtoon');
    
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    await browser.close();
    
    const allSeries = [];
    let pageNum = 1;
    const limit = 50;
    
    while (true)
    {
        const url = `https://valirscans.org/api/series?type=Manhwa,Manhua,Manga,Webtoon&page=${pageNum}&limit=${limit}`;
        const response = await fetch(url, { headers: { 'Cookie': cookieString } });
        const { data, meta } = await response.json();
        
        if (!data?.length) break;
        allSeries.push(...data);
        console.log(`Page ${pageNum}: Got ${data.length} (total: ${allSeries.length})`);
        
        if (pageNum++ >= meta?.totalPages) break;
        await new Promise(r => setTimeout(r, 500));
    }
    
    await fs.writeFile('series.json', JSON.stringify(allSeries, null, 2));
    console.log(`\n✅ Done! ${allSeries.length} series saved.`);
}

getAllSeries();