#!/usr/bin/env node

import {program} from "commander/esm.mjs";
import stringify from "csv-stringify";
import {readFileSync} from "fs";
import {unofficial, unofficialRCV, certifiedRCV} from "./src/index.js";
import * as readline from "readline";

const scrapers = {
  "unofficial": unofficial,
  "unofficial-rcv": unofficialRCV,
  "certified-rcv": certifiedRCV
}
const defaultScraper = "unofficial";

const formats = ["ndjson", "json", "csv"];
const defaultFormat = "ndjson";

program
  .version(JSON.parse(readFileSync("./package.json")).version);

// ID scraper CLI
program
  .command("ids")
  .argument("<url>", "the index URL, e.g. https://web.enrboenyc.us/index.html")
  .option("-t, --type <type>", `options: ${Object.keys(scrapers).join(", ")}`, defaultScraper)
  .option("-f, --format <format>", `options: ${formats.join(", ")}`, defaultFormat)
  .option("--selector <selector>", "selector for index parent, used with \"certified-rcv\"")
  .action(async (url, options) => {
    const type = options.type === undefined ? defaultScraper : options.type;
    const format = options.format === undefined ? defaultFormat : options.format;

    if (Object.keys(scrapers).indexOf(type) < 0) {
      printError(`--type must be one of: ${Object.keys(scrapers).join(", ")}`);
    }

    if (formats.indexOf(format) < 0) {
      printError(`--format must be one of: ${formats.join(", ")}`);
    }

    if (type === "certified-rcv" && !options.selector) {
      printError("must specify --selector when using \"certified-rcv\"");
    }
    
    try {
      const scraper = scrapers[type];
      const ids = type === "certified-rcv" 
        ? scraper.scrapeIds(url, options.selector)
        : scraper.scrapeIds(url);

      outputData(ids, format);
    } catch (e) {
      printError(e)
    }
  });

// Results CLI
program
  .command("results")
  .argument("[urls...]", "URLs to scrape, e.g. https://web.enrboenyc.us/CD24306AD0.html")
  .option("-t, --type <type>", `options: ${Object.keys(scrapers).join(", ")}`, defaultScraper)
  .option("-f, --format <format>", `options: ${formats.join(", ")}`, defaultFormat)
  .option("--all", "scrape all available races (URL must be the index)")
  .option("--selector <selector>", "selector for index parent, used with --all and \"certified-rcv\"")
  .action(async (urls, options) => {
    const type = options.type === undefined ? defaultScraper : options.type;
    const format = options.format === undefined ? defaultFormat : options.format;

    if (Object.keys(scrapers).indexOf(type) < 0) {
      printError(`--type must be one of: ${Object.keys(scrapers).join(", ")}`);
    }

    if (formats.indexOf(format) < 0) {
      printError(`--format must be one of: ${formats.join(", ")}`);
    }

    if (options.all && !urls[0]) {
      printError("must include index url with --all");
    }

    if (options.all && type === "certified-rcv" && !options.selector) {
      printError("must specify --selector when using \"certified-rcv\" with --all");
    }

    try {
      const scraper = scrapers[type];

      // Treat URL as index and scrape ids before getting results
      if (options.all) {
        const url = urls[0];
  
        const ids = type === "certified-rcv" 
          ? scraper.scrapeIds(url, options.selector)
          : scraper.scrapeIds(url);

        async function* generator() {
          for await (const {url} of ids) {
            for await (const result of scraper.scrapeRace(url)) {
              yield result;
            }
          }
        }
  
        outputData(generator(), format);
      // Scrape results for each URL passed
      } else if (urls[0]) {
        async function* generator() {
          for (const url of urls) {
            for await (const result of scraper.scrapeRace(url)) {
              yield result;
            }
          }
        }
  
        outputData(generator(), format);
      // Scrape results for URLs passed from stdin
      } else {
        const rl = readline.createInterface({
          input: process.stdin,
          output: null
        });

        async function* generator() {
          for await (const line of rl) {
            for await (const result of scraper.scrapeRace(line)) {
              yield result;
            }
          }
        }

        outputData(generator(), format);
      }
    } catch (e) {
      printError(e)
    }
  });

program.parseAsync(process.argv);

// Format async iterator output as JSON, CSV or NDJSON
async function outputData(iterator, format) {
  if (format === "json") {
    console.log("[");
    for await (const [data, next] of getNext(iterator)) {
      // Comma-separate objects in array
      console.log(`  ${JSON.stringify(data, undefined, 2)}${next ? "," : ""}`.replace(/\n\r?/g, '\n  '));
    }
    console.log("]");
  } else if (format === "csv") {
    const stringifier = stringify({
      header: true,
    });
    stringifier.pipe(process.stdout);

    for await (const data of iterator) {
      stringifier.write(data);
    }
  } else {
    for await (const data of iterator) {
      console.log(JSON.stringify(data));
    }
  }
}

// Yield current results and next result in an array to allow checking for the
// second to last value
async function* getNext(iterator) {
  var current;

  try {
    for await (const value of iterator) {
      if (current) {
        yield [current, value];
      }
      current = value;
    }
  } finally {
    yield [current, undefined];
  }
}

function printError(error) {
  console.error("error: " + error)
  process.exit(1);
}
