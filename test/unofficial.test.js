const {scrapeIds} = require("../src/unofficial.js").default;
const axios = require("axios");
const fs = require("fs");

jest.mock("axios");

axios.get.mockImplementation((url) => {
  const pathMatches = url.match(/^https?:\/\/(.+)$/);
  const path = pathMatches && pathMatches[1] || url;

  return Promise.resolve({
    data: fs.readFileSync(path)
  });
});

describe("scrapeIds", () => {
  it("gets the office name, id and URL for each race", async () => {
    const ids = require("./outputs/unofficial-primary-ids.json");
    
    const data = [];
    const iterator = await scrapeIds("http://examples/unofficial-primary/index.html");
    for await (const id of iterator) {
      data.push(id);
    }

    expect(data).toEqual(ids);
  });
});