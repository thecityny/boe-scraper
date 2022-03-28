import axios from "axios";
import {JSDOM} from "jsdom";

// Get the URL, office name and id for each race in an election from the results
// page, given a selector for the election div
async function* scrapeIds(url, selector) {
  const index = await axios.get(url);
  const dom = new JSDOM(index.data);
  const document = dom.window.document;

  // Target specific div on the page
  const root = document.querySelector(selector);
  const rows = Array.from(root.querySelectorAll("table tbody tr")).slice(1);

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td"));
    const path = cells[2].querySelector("a").getAttribute("href");

    const id = path.match(/\/0?(\d+)_1.html$/)[1];
    const targetUrl = new URL(path, url).href;

    yield {
      office: cells[0].innerHTML,
      id: id,
      url: targetUrl
    };
  }
}

// Scrape certified RCV results for a race
async function* scrapeRace(url) {
  const results = await getRCVCert(url);
  for (const result of results) {
    yield result;
  }
}

// Get RCV rounds from single page
async function getRCVCert(url) {
  const ignore = ["How the votes were counted - round by round", "&nbsp;", "Eliminated in this round", "Elected", "Votes in this round"];
  const id = url.match(/\/0?(\d+)_1.html$/)[1];

  try {
    const index = await axios.get(url);
    const dom = new JSDOM(index.data);
    const document = dom.window.document;

    // Extract the main table from the page layout
    const layoutRows = document.querySelector("#PanelReport table table tbody").children;
    const bodyRows = layoutRows[3].querySelector("table tbody").children;
    const rows = Array.from(bodyRows[3].querySelectorAll("table tbody tr"));

    // Extract metadata table
    const metaTable = layoutRows[2].querySelector("table tbody");
    const contestRow = metaTable.querySelector("tr");
    const office = Array.from(contestRow.querySelectorAll("td"))[1].innerHTML;

    return rows.reduce((rows, row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      const candidate = cells[0].innerHTML;

      // Filter out non-data rows
      if (ignore.indexOf(candidate) < 0) {
        // Get the candidate's votes for each round from the cells
        const rounds = cells.reduce(([colIndex, rounds], cell) => {
          // Each round takes up 3 columns
          const round = Math.floor(colIndex / 3);
          const position = colIndex % 3;

          // Round 0 is just the candidate name
          // In round 1, votes are in the first column
          // In every round after round 1, votes are in the second column
          if ((round === 1 && position === 0) || (round > 1 && position === 1)) {
            const votes = parseInt(cell.innerHTML.replace(",", "")) || 0;

            // In the first round, an empty cell means no votes
            // In every other round, a non-numeric cell means eliminated
            if (votes || round === 1) {
              return [colIndex + cell.colSpan, [...rounds, {
                office,
                id,
                round,
                candidate,
                votes
              }]];
            }
          }

          // For all cells that are not a vote count, just increment the cell index
          // This means there is no data added for eliminated candidates
          return [colIndex + cell.colSpan, rounds];
        }, [0, []]);

        return [...rows, ...rounds[1]];
      }

      return rows;
    }, []);
  } catch (e) {
    console.log(`Failed to fetch certified RCV ${id}`);
    return [];
  }
}

export default {
  scrapeIds,
  scrapeRace
}
