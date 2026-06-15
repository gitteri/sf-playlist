const axios = require('axios');
const cheerio = require('cheerio');

async function run() {
  const url = 'https://www.songkick.com/metro-areas/90736-us-santa-fe';
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);
    const elements = $('li.event-listings-element');
    console.log(`Found ${elements.length} event listings.`);
    
    if (elements.length > 0) {
      console.log('\n--- FIRST ELEMENT HTML ---');
      console.log(elements.first().html());
      
      console.log('\n--- SECOND ELEMENT HTML ---');
      console.log(elements.eq(1).html());
    }
  } catch (error) {
    console.error('Error fetching Songkick HTML:', error.message);
  }
}

run();
