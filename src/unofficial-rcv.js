import axios from "axios";
import {JSDOM} from "jsdom";

// Get the URL, office name and id for each race in the election from the main index
async function* scrapeIds(url) {
  const indexUrls = await getIndexUrls(url);

  for (const indexUrl of indexUrls) {
    // Get file slug from URL
    const slugRegex = new RegExp("([^/]+)\.html$");
    // Get race ID from slug
    const idRegex = new RegExp(`0(\\d+)_(\\d+)$`);

    const indexSlug = indexUrl.url.match(slugRegex)[1];

    // Un-nest links for elections that link to summary pages (i.e. city council)
    if (!indexSlug.match(idRegex)) {
      const summaryUrls = await getSummaryUrls(indexUrl.url);

      for (const summaryUrl of summaryUrls) {
        const summarySlug = summaryUrl.url.match(slugRegex)[1];
        const office = (indexUrl.party ? indexUrl.party + " " : "") + summaryUrl.office;

        yield {
          office: office,
          id: summarySlug.match(idRegex)[1],
          url: summaryUrl.url
        };
      }
    } else {
      const office = (indexUrl.party ? indexUrl.party + " " : "") + indexUrl.office;
      yield {
        office: office,
        id: indexSlug.match(idRegex)[1],
        url: indexUrl.url
      };
    }
  }
}

// Get URL, party and office for each race listed at the given race index
async function getIndexUrls(url) {
  const rows = await getRows(url, 1);

  return rows.map(row => {
    const cells = Array.from(row.querySelectorAll("td"));
    const office = cells[1].innerHTML.trim();
    const party = cells[2].innerHTML;

    const link = cells[3].querySelector("a");
    const {href} = new URL(link.getAttribute("href"), url);

    return {office, party, url: href}
  });
}

// Pull office and URL from the given summary page
async function getSummaryUrls(url) {
  const rows = await getRows(url, 0);

  return rows.map(row => {
    const cells = Array.from(row.querySelectorAll("td"));

    const link = cells[2].querySelector("a");
    const {href} = new URL(link.getAttribute("href"), url);
    const office = link.innerHTML;

    return {office, url: href};
  });
}

// Scrape RCV results for a race
async function* scrapeRace(url) {
  var round = url;
  
  while (round) {
    const [results, nextRound] = await getRCVRound(round);

    for (const result of results) {
      yield result;
    }

    round = nextRound;
  }
}

// Get votes and next round link from RCV results page
async function getRCVRound(url) {
  const index = await axios.get(url);
  const dom = new JSDOM(index.data);
  const document = dom.window.document;

  // Get file slug from URL
  const slug = url.match(/([^/]+)\.html$/)[1];
  // Get round ID from slug
  const id = slug.match(/^0(\d+)_(\d+)$/)[1];

  // Extract the main table from the page layout
  const layout = document.querySelector("table tbody");
  const body = layout.querySelector("tr table tbody");
  const tables = getTables(body);

  // The first table on the page has the office name and date of results
  const metaTable = tables[0].querySelector("tr table tbody");
  const contestRow = metaTable.querySelector("tr");
  const office = Array.from(contestRow.querySelectorAll("td"))[1].innerHTML;
  
  // The last table in the layout has the data
  const table = tables[tables.length - 1];
  // Extract the nested row data
  const rows = Array.from(table.querySelector("tbody").children).map(row => {
    return row.querySelector("table tbody tr");
  });

  // Gets the round number
  const roundRegex = new RegExp("ROUND\\s(\\d+)");

  // Round navigation container
  const linkContainer = body.querySelector("a").parentElement;

  // Pull the round number from current round indicator
  const currentRoundElement = Array.from(linkContainer.childNodes).filter(node => {
    return node.constructor.name === "Text" && node.textContent.match(roundRegex);
  })[0];
  const round = currentRoundElement && Number(currentRoundElement.textContent.match(roundRegex)[1]) || 1;

  // Get the next round from the links at the top of the page
  const roundLinks = Array.from(linkContainer.querySelectorAll("a")).reduce((roundLinks, link) => {
    const title = link.getAttribute("title");
    const roundMatches = title.match(roundRegex);

    if (roundMatches) {
      return [...roundLinks, {
        round: Number(roundMatches[1]),
        url: new URL(link.getAttribute("href"), url).href,
      }]
    }

    return roundLinks;
  }, []);
  const maxRound = Math.max(...roundLinks.map(d => d.round));

  // If the round link number is higher than the current round, return the link
  const nextRound = maxRound > round && roundLinks.filter(d => d.round === maxRound)[0].url;

  // Get the results
  const results = rows.map(row => {
    const cells = Array.from(row.querySelectorAll("td")).map(cell => cell.innerHTML);
    const candidate = cells[0].trim();
    const voteMatches = cells[1].match(/^(\d+) \((.+)%\)$/);
    const inactiveMatches = cells[1].match(/^(\d+) with no choices left$/);
    const votesString = voteMatches ? voteMatches[1] : inactiveMatches ? inactiveMatches[1] : cells[1] === "eliminated" ? -1 : undefined;
    const votes = Number(votesString);

    return {
      office,
      id,
      round,
      candidate,
      votes
    };
  });

  return [results, nextRound];
}

// Pull table data from the given page given the table index
async function getRows(url, tableIndex) {
  const index = await axios.get(url);
  const dom = new JSDOM(index.data);
  const document = dom.window.document;

  // Extract the main table from the page layout
  const layout = document.querySelector("table tbody");
  const body = layout.querySelector("tr table tbody");
  const tables = getTables(body);

  const table = tables[tableIndex];
  const rows = Array.from(table.querySelectorAll("tr"));

  // Get the max number of cell in the row. Rows without data have fewer cells.
  const columns = Math.max(...rows.map(d => d.querySelectorAll("td").length));
  
  return rows.filter(row => row.querySelectorAll("td").length === columns);
}

// Get array of tables from the page body
function getTables(body) {
  // Using .children() because ">" is buggy https://github.com/jsdom/jsdom/issues/3067
  return Array.from(body.children).reduce((tables, row) => {
    const table = row.querySelector("table");

    if (table) {
      return [...tables, table];
    }

    return tables
  }, []);
}

export default {
  scrapeIds,
  scrapeRace
}
