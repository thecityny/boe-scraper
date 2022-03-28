import axios from "axios";
import {JSDOM} from "jsdom";

// Get the URL, office name and id for each race in the election from the main index
async function* scrapeIds(url) {
  const indexUrls = await getIndexUrls(url);

  for (const indexUrl of indexUrls) {
    // Get file slug from URL
    const slugRegex = new RegExp("([^/]+)\.html$");
    // Get race ID from slug
    const idRegex = new RegExp("CD(\\d+)ADI0$");
    
    const indexSlug = indexUrl.url.match(slugRegex)[1];

    // Un-nest links for elections that link to summary pages (i.e. city council)
    if (!indexSlug.match(idRegex)) {
      const summaryUrls = await getSummaryUrls(indexUrl.url);

      // Add party from the parent link
      for (const summaryUrl of summaryUrls) {
        const summarySlug = summaryUrl.url.match(slugRegex)[1];
        const summaryId = summarySlug.match(idRegex)[1];
        const office = (indexUrl.party ? indexUrl.party + " " : "") + summaryUrl.office;

        yield {
          office: office,
          id: summaryId,
          url: summaryUrl.url.replace(slugRegex, `CD${summaryId}AD0.html`)
        };
      }
    } else {
      const indexId = indexSlug.match(idRegex)[1];
      const office = (indexUrl.party ? indexUrl.party + " " : "") + indexUrl.office;

      yield {
        office: office,
        id: indexId,
        url: indexUrl.url.replace(slugRegex, `CD${indexId}AD0.html`)
      };
    } 
  }
}

// Get URL, party and office for each race listed at the given race index
async function getIndexUrls(url) {
  const {rows} = await getRows(url);
  
  return rows.map(row => {
    // Extract cells from row markup
    const cells = Array.from(row.querySelectorAll("td"));

    const office = cells[2].innerHTML;
    const party = cells[3].innerHTML;
  
    const link = cells[6].querySelector("a");
    const {href} = new URL(link.getAttribute("href"), url);

    return {office, party, url: href}
  });
}

// Pull office and URL from the given summary page
async function getSummaryUrls(url) {
  const rows = (await getRows(url)).rows;

  return rows.map(row => {
    const cells = Array.from(row.querySelectorAll("td"));

    const link = cells[2].querySelector("a");
    const href = new URL(link.getAttribute("href"), url).href;
    const office = link.innerHTML;

    return {office, url: href}
  });
}

// Scrape ED results from every AD in a race
async function* scrapeRace(url) {
  const ads = await getADUrls(url);

  for (const {url} of ads) {
    const adResults = await getADResults(url);

    for (const result of adResults) {
      yield result;
    }
  }
}

// Get list of ADs from the race's AD index
async function getADUrls(url) {
  const {rows} = await getRows(url);

  return rows.reduce((ads, row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    const link = cells[0].querySelector("a");

    if (link) {
      const ad = link.innerHTML.match(/^AD\s+(\d+)$/)[1];
      const {href} = new URL(link.getAttribute("href"), url);
      return [...ads, {ad, url: href}];
    }
    
    return ads;
  }, []);
}

// Get ED results from AD page
async function getADResults(url) {
  const page = await getRows(url);
  const data = page.rows.map(row => Array.from(row.querySelectorAll("td")).map(cell => cell.innerHTML));

  const pageTitle = page.body.querySelector("th").innerHTML;
  const office = pageTitle.replace(/\s\[.+\]$/, "");
  const ad = pageTitle.match(/\s\[\sAD\s(\d+)\s\]$/)[1];

  const slug = url.match(/([^/]+)\.html$/)[1];
  const id = slug.match(/^CD(\d+)AD\d+$/)[1];

  // Get the candidates and party lines
  const candidates = data[0].slice(3);
  const partyLines = data[1].slice(3).map(partyText => {
    const partyMatches = partyText.match(/^\((.+)\)$/);
    const partyName = partyMatches ? partyMatches[1] : partyText;
    return partyName.replace(/\&nbsp;/g, "");
  });

  // Get each the vote for each candidate in the ED
  return data.slice(2).reduce((results, cells) => {
    const edMatches = cells[0].match(/^ED\s+(\d+)$/);
    
    // Ignore non-ED rows 
    if (edMatches) {
      const ed = edMatches[1];
      const edResults = cells.slice(3).reduce((edResults, cell, index) => {
        const votes = Number(cell);

        // Skip odd-numbered cells (padding cells)
        if (index % 2 === 0) {
          return [...edResults, {
            office,
            id,
            ad,
            ed,
            candidate: candidates[index],
            party: partyLines[index],
            votes
          }];
        }

        return edResults;
      }, []);
  
      return [...results, ...edResults];
    }
    
    return results;
  }, []);
}

// Pull table data from the given page
async function getRows(url) {
  const index = await axios.get(url);
  const dom = new JSDOM(index.data);
  const document = dom.window.document;

  // Extract the main table from the page layout
  const layout = document.querySelector("table");
  const body = layout.querySelector("tbody tr:last-child table");
  const table = body.querySelector("tbody tr:last-child table");

  const rows = Array.from(table.querySelectorAll("tr"));
  // Get the max number of cell in the row. Rows without data have fewer cells.
  const columns = Math.max(...rows.map(row => row.querySelectorAll("td").length));
  
  return {
    // Filter the rows to the ones with data
    rows: rows.filter(row => row.querySelectorAll("td").length === columns),
    body: body
  }
}

export default {
  scrapeIds,
  scrapeRace
}
