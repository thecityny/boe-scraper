# NYC Board of Elections Scraper

Scrape unofficial and certified election results from the NYC Board of Elections website.

## Installing

```
brew install node
````

To use the CLI directly
```
npm install -g thecityny/boe-scraper
````

As a dependency
```
npm install thecityny/boe-scraper
```

## Running the CLI

Installed globally: `scrape-boe [options] [command]`

Installed as a dependency: `npm exec scrape-boe [options] [command]`

From the package root: `./scrape-boe.js [options] [command]` or `node scrape-boe [options] [command]`

## Usage

Commands print results to stdout as NDJSON. The output can also be formatted as a CSV or JSON using --format. Supports scrapers for `unofficial` (default), `unofficial-rcv` and `certified-rcv` using --type.

### ids

Get the race id, office name and URL for each race in the election from the results index.

```
scrape-boe ids https://web.enrboenyc.us
```

When using the `certified-rcv` type, a --selector must be passed identifying the div containing the results.

```
scrape-boe ids --type certified-rcv --selector '#p3' https://www.vote.nyc/page/election-results-summary-2021
```

### results

Get the results from a race or multiple races.

```
scrape-boe results https://web.enrboenyc.us/CD23376AD0.html
```

The fields included in the results depend on the type used. All types will output the race id, office name, candidate name, and the number of votes received. The `unofficial` type returns precinct-level results identified by the assembly district id and election district id. The `unofficial-rcv` and `certified-rcv` types return overall results for each RCV round identified by the round number.

A space-separated list of URLs can be passed in the same call to output results from multiple races of the same type. Specifying --all with the URL of the results index will output results from every race in an election.

```
scrape-boe results --all https://web.enrboenyc.us
```
Save files as csv
```
scrape-boe results --all https://web.enrboenyc.us > -f 'csv' filename.csv
```

If no URL is specified, URLs are read from stdin.

```
scrape-boe ids https://web.enrboenyc.us | jq -r '.url' | scrape-boe results
```

## Programmatic Usage

In addition to the CLI, you can import the `scrapeIds()` and `scrapeRace()` functions from `boe-scraper/unofficial`, `boe-scraper/unofficial-rcv` and `boe-scraper/certified-rcv`, or import `{unofficial, unofficialRCV, certifiedRCV}` from `boe-scraper`. 

Each function accepts a URL and returns an async generator that yields results objects. The `certifiedRCV.scrapeIds()` function requires a second argument specifying a div selector string.

## Examples

Live election night results are usually posted to https://web.enrboenyc.us and remain available until the next election, or when certified results are published. It’s usually a good idea to download a copy of the pages using a tool like wget in case they become unavailable. You can find a copy of the unofficial results pages from the 2021 primary and general election in the examples folder.

In 2021, first round results from ranked choice voting primaries were published on election night, followed a week later by the full RCV rounds. The unofficial RCV results replaced the election night results on https://web.enrboenyc.us, and were updated weekly as absentee ballots were counted. Examples of the unofficial and certified ranked choice results pages are also available in the examples folder.

You can run the examples by running the code below in the examples directory. 

```
npx http-server
```
This will run a server on your machine locally and if you go the localhost printed on your terminal, you can see it building the website on your machine. 

Then run the commands above on that URL. It will look like this http://127.0.0.1:8080/unofficial-general/. For example, if you want to scrape mayoral results, you can scrape all the results by running this code

```
scrape-boe results --all http://127.0.0.1:8080/unofficial-general/CD23376ADI0.html
```

## How do I save it in a file?

Modify your code like this

```
scrape-boe results --all <PASTE URL HERE> -f 'csv' > filename.csv
```
